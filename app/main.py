"""SportHost Beta - host-first badminton club operations.
Based on ClubHost Sprint 0-1; see README for the current beta scope.
"""
import os
import re
import hmac
import hashlib
import secrets
import csv
import io
import time
from collections import OrderedDict, deque
from threading import Lock
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from sqlalchemy import create_engine, ForeignKey, UniqueConstraint, CheckConstraint, select, func, MetaData, false, or_
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session, sessionmaker
from sqlalchemy.pool import NullPool
from app.settings import load_settings

SETTINGS = load_settings()
DATABASE_URL = SETTINGS['url']
SECRET_KEY = SETTINGS['secret']
COOKIE_SECURE = SETTINGS['cookie_secure']
# A PostgreSQL schema is deliberately isolated from pre-existing applications.
# SSH -L is a separate operator-managed tunnel: SQLAlchemy talks to localhost TCP.
engine_options = {}
if SETTINGS['driver'] == 'postgresql':
    engine_options['connect_args'] = {'connect_timeout': 10, 'prepare_threshold': None}
    if SETTINGS['serverless']:
        # The provider's pooled URL owns the pool; functions retain no idle sockets.
        engine_options['poolclass'] = NullPool
else:
    engine_options['connect_args'] = {'check_same_thread': False}
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    **engine_options,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
signer = URLSafeTimedSerializer(SECRET_KEY, salt='clubhost-session-v1')
csrf_signer = URLSafeTimedSerializer(SECRET_KEY, salt='clubhost-csrf-v1')
lookup_signer = URLSafeTimedSerializer(SECRET_KEY, salt='sporthost-guest-review-v1')
_lookup_attempts = OrderedDict()
_lookup_lock = Lock()

class Base(DeclarativeBase):
    metadata = MetaData(schema=SETTINGS['schema'])

class Host(Base):
    __tablename__ = 'hosts'
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    password_hash: Mapped[str]
    email_verified: Mapped[bool] = mapped_column(default=False, server_default=false())
    session_version: Mapped[int] = mapped_column(default=0, server_default='0')
    is_platform_admin: Mapped[bool] = mapped_column(default=False, server_default=false())

class Club(Base):
    __tablename__ = 'clubs'
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('hosts.id'), index=True)
    name: Mapped[str]
    location: Mapped[str] = mapped_column(default='')
    bank_name: Mapped[str] = mapped_column(default='', server_default='')
    account_holder: Mapped[str] = mapped_column(default='', server_default='')
    account_number: Mapped[str] = mapped_column(default='', server_default='')
    payment_note: Mapped[str] = mapped_column(default='', server_default='')
    qr_key: Mapped[str | None]
    monthly_fee: Mapped[int] = mapped_column(default=300000, server_default='300000')
    monthly_fee_male: Mapped[int | None]
    monthly_fee_female: Mapped[int | None]
    trial_ends_at: Mapped[str | None]
    pro_ends_at: Mapped[str | None]

class Member(Base):
    __tablename__ = 'members'
    __table_args__ = (
        UniqueConstraint('club_id', 'phone', name='uq_member_phone'),
        CheckConstraint("gender IN ('male', 'female', 'unspecified')", name='ck_member_gender'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(ForeignKey('clubs.id'), index=True)
    name: Mapped[str]
    phone: Mapped[str]
    kind: Mapped[str] = mapped_column(default='fixed')
    gender: Mapped[str] = mapped_column(default='unspecified', server_default='unspecified')
    level: Mapped[str] = mapped_column(default='')

class GameSession(Base):
    __tablename__ = 'game_sessions'
    __table_args__ = (UniqueConstraint('recurring_rule_id', 'starts_at', name='uq_rule_occurrence'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(ForeignKey('clubs.id'), index=True)
    public_id: Mapped[str] = mapped_column(unique=True, index=True)
    title: Mapped[str]
    venue: Mapped[str] = mapped_column(default='')
    starts_at: Mapped[str]
    capacity: Mapped[int]
    capacity_male: Mapped[int | None]
    capacity_female: Mapped[int | None]
    fixed_fee: Mapped[int] = mapped_column(default=0)
    guest_fee: Mapped[int] = mapped_column(default=0)
    fixed_fee_male: Mapped[int | None]
    fixed_fee_female: Mapped[int | None]
    guest_fee_male: Mapped[int | None]
    guest_fee_female: Mapped[int | None]
    is_open: Mapped[bool] = mapped_column(default=True)
    recurring_rule_id: Mapped[int | None] = mapped_column(ForeignKey('recurring_rules.id'))
    rsvp_deadline: Mapped[str | None]
    is_cancelled: Mapped[bool] = mapped_column(default=False, server_default=false())

class Booking(Base):
    __tablename__ = 'bookings'
    __table_args__ = (UniqueConstraint('session_id', 'member_id', name='uq_booking_member_session'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey('game_sessions.id'), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.id'), index=True)
    status: Mapped[str] = mapped_column(default='pending')
    paid: Mapped[bool] = mapped_column(default=False)
    attended: Mapped[bool] = mapped_column(default=False)
    fee_amount: Mapped[int | None]
    access_key: Mapped[str] = mapped_column(default=lambda: secrets.token_urlsafe(24), server_default='')
    qr_key: Mapped[str | None]
    payment_status: Mapped[str] = mapped_column(default='unpaid', server_default='unpaid')
    gender_at_booking: Mapped[str] = mapped_column(default='unspecified',server_default='unspecified')

class Expense(Base):
    __tablename__ = 'expenses'
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey('game_sessions.id'), index=True)
    title: Mapped[str]
    amount: Mapped[int]

class MonthlyDue(Base):
    __tablename__ = 'monthly_dues'
    __table_args__ = (UniqueConstraint('member_id', 'period', name='uq_member_month'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey('members.id'), index=True)
    period: Mapped[str]
    amount: Mapped[int]
    paid: Mapped[bool] = mapped_column(default=False)
    access_key: Mapped[str] = mapped_column(default=lambda: secrets.token_urlsafe(24), server_default='')
    qr_key: Mapped[str | None]
    payment_status: Mapped[str] = mapped_column(default='unpaid',server_default='unpaid')

from app.models_extra import RecurringRule, ClubAccess, AuditLog, StoredAsset, PaymentProof, EmailToken, SubscriptionRequest
from app.security import RequestLimit

# Only disposable/local SQLite gets automatic table creation. PostgreSQL is
# ALWAYS managed by Alembic, including local PostgreSQL and staging.
if SETTINGS['driver'] == 'sqlite':
    Base.metadata.create_all(engine)
app = FastAPI(title='SportHost', version='0.1.0')
BASE_DIR = os.path.dirname(__file__)
# Vercel serves public/ from its CDN and omits it from the Python bundle.
if not SETTINGS['serverless']:
    app.mount('/static', StaticFiles(directory=os.path.join(BASE_DIR, '..', 'public', 'static')), name='static')
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, 'templates'))
templates.env.filters['vnd'] = lambda n: f'{int(n):,}'.replace(',', '.') + 'đ'
GENDER_LABELS = {'male': 'Nam', 'female': 'Nữ', 'unspecified': 'Chưa cập nhật'}
templates.env.globals['gender_labels'] = GENDER_LABELS


def validated_gender(value: str):
    if value not in GENDER_LABELS:
        raise HTTPException(400, 'Invalid gender')
    return value


def db_session():
    with SessionLocal() as db:
        yield db


def hashed_password(raw: str):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', raw.encode(), salt, 310_000)
    return f'{salt.hex()}:{dk.hex()}'


def check_password(raw: str, stored: str):
    try:
        salt, expected = stored.split(':')
        actual = hashlib.pbkdf2_hmac('sha256', raw.encode(), bytes.fromhex(salt), 310_000)
        return hmac.compare_digest(actual, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def current_host(request: Request, db: Session):
    token = request.cookies.get('clubhost')
    if not token: return None
    try:
        payload = signer.loads(token, max_age=60*60*24*14)
        host = db.get(Host, payload['id'])
        return host if host and payload.get('v', 0) == host.session_version else None
    except (BadSignature, SignatureExpired, KeyError):
        return None


def require_host(request: Request, db: Session):
    host = current_host(request, db)
    if not host: raise HTTPException(status_code=401, detail='Please sign in')
    return host


def accessible_clubs(db: Session, host: Host):
    return db.scalars(select(Club).where(or_(Club.owner_id == host.id,
        Club.id.in_(select(ClubAccess.club_id).where(ClubAccess.host_id == host.id)))).order_by(Club.name)).all()


def owned_club(request: Request, db: Session, club_id: int, permission=None):
    host = require_host(request, db)
    club = db.get(Club, club_id)
    access = db.scalar(select(ClubAccess).where(ClubAccess.club_id == club_id, ClubAccess.host_id == host.id)) if club else None
    if not club or (club.owner_id != host.id and not access): raise HTTPException(404, 'Club not found')
    permission = permission or ('view' if request.method in ('GET','HEAD') else 'manage')
    allowed = {'manager': {'view', 'manage'}, 'finance': {'view', 'finance'}}
    if club.owner_id != host.id and permission not in allowed.get(access.role, set()):
        raise HTTPException(403, 'Bạn không có quyền thực hiện thao tác này')
    return host, club


def owned_session(request: Request, db: Session, game_id: int, *, lock: bool = False, permission=None):
    query = select(GameSession).where(GameSession.id == game_id)
    if lock:
        query = query.with_for_update()
    game = db.scalar(query)
    if not game: raise HTTPException(404)
    _, club = owned_club(request, db, game.club_id, permission=permission)
    return game, club


def csrf_token(request: Request):
    session_cookie = request.cookies.get('clubhost', 'public')
    return csrf_signer.dumps({'session': session_cookie})


def ensure_csrf(request: Request, token: str):
    try:
        data = csrf_signer.loads(token, max_age=60*60*6)
        if not hmac.compare_digest(data['session'], request.cookies.get('clubhost','public')):
            raise ValueError('Invalid CSRF')
    except (BadSignature, SignatureExpired, KeyError, ValueError):
        raise HTTPException(403, 'Invalid or expired form token; refresh page')


def page(request: Request, template: str, **kwargs):
    host = kwargs.get('host')
    if host:
        with SessionLocal() as nav_db:
            kwargs.setdefault('nav_clubs', accessible_clubs(nav_db, host))
            manager_ids=set(nav_db.scalars(select(ClubAccess.club_id).where(ClubAccess.host_id==host.id,ClubAccess.role=='manager')))
            manage_ids={c.id for c in kwargs['nav_clubs'] if c.owner_id==host.id or c.id in manager_ids}
            kwargs.setdefault('manage_ids',manage_ids)
            kwargs.setdefault('manage_clubs',[c for c in kwargs['nav_clubs'] if c.id in manage_ids])
            if kwargs.get('club'):
                selected_club=kwargs['club']
                kwargs.setdefault('can_manage_club',selected_club.id in manage_ids)
                kwargs.setdefault('can_finance_club',selected_club.owner_id==host.id or bool(nav_db.scalar(select(ClubAccess.id).where(
                    ClubAccess.club_id==selected_club.id,ClubAccess.host_id==host.id,ClubAccess.role=='finance'))))
        path = request.url.path
        section = ('schedule' if path.startswith(('/schedule','/games')) else 'members' if path.startswith('/members')
                   else 'finance' if path.startswith('/finance') else 'account' if path.startswith('/account')
                   else 'admin' if path.startswith('/admin') else 'clubs' if path.startswith('/clubs') else 'dashboard')
        kwargs.setdefault('active_section', section)
        kwargs.setdefault('section_title', {'dashboard':'Tổng quan','schedule':'Lịch đánh','members':'Thành viên',
                  'finance':'Thu chi','clubs':'Quản lý CLB','account':'Tài khoản','admin':'Quản trị SportHost'}[section])
    response = templates.TemplateResponse(request, template, {**kwargs, 'csrf': csrf_token(request)})
    if host: response.headers['Cache-Control'] = 'private, no-store'
    return response


def host_redirect(request: Request, fallback: str):
    # Return to a host workspace after an action, never to another origin.
    referer = urlsplit(request.headers.get('referer', ''))
    if referer.netloc == request.url.netloc and re.fullmatch(r'/(?:dashboard|schedule|members|finance|clubs(?:/\d+(?:/settings)?)?)', referer.path):
        destination = referer.path + ('?' + referer.query if referer.query else '')
        if referer.fragment: destination += '#' + referer.fragment
        return redirect(destination)
    return redirect(fallback)


def redirect(path: str):
    return RedirectResponse(path, status_code=303)


def digits_phone(phone: str):
    phone = re.sub(r'[\s.\-()]', '', phone.strip())
    if not re.fullmatch(r'\+?[0-9]{9,15}', phone): raise HTTPException(400, 'Invalid phone')
    if re.fullmatch(r'(?:\+84|84)[35789][0-9]{8}', phone):
        phone = '0' + phone[-9:]
    return phone


def phone_aliases(phone: str):
    aliases = [phone]
    if re.fullmatch(r'0[35789][0-9]{8}', phone):
        aliases.extend(['+84' + phone[1:], '84' + phone[1:]])
    return aliases


def member_by_phone(db: Session, club_id: int, phone: str):
    return db.scalar(select(Member).where(Member.club_id == club_id,
                                         Member.phone.in_(phone_aliases(phone))).order_by(Member.id))


def limit_guest_lookup(request: Request, public_id: str):
    # Best effort per process; bounded memory, including on serverless instances.
    key = (request.client.host if request.client else 'unknown', public_id)
    now = time.monotonic()
    with _lookup_lock:
        attempts = _lookup_attempts.setdefault(key, deque())
        _lookup_attempts.move_to_end(key)
        while attempts and attempts[0] <= now - 60:
            attempts.popleft()
        if len(attempts) >= 30:
            raise HTTPException(429, 'Too many lookups; try again in one minute', headers={'Retry-After': '60', 'Cache-Control': 'no-store'})
        attempts.append(now)
        while len(_lookup_attempts) > 1024:
            _lookup_attempts.popitem(last=False)


def money(n):
    try:
        result = int(n)
    except (ValueError, TypeError): raise HTTPException(400, 'Invalid amount')
    if result < 0 or result > 100_000_000: raise HTTPException(400, 'Invalid amount')
    return result


def optional_money(value: str):
    return None if not value.strip() else money(value)


def member_fee(game: GameSession, member: Member):
    kind = 'fixed' if member.kind == 'fixed' else 'guest'
    if member.gender in ('male', 'female'):
        override = getattr(game, f'{kind}_fee_{member.gender}')
        if override is not None:
            return override
    return getattr(game, f'{kind}_fee')


def booking_fee(game: GameSession, booking: Booking, member: Member):
    if booking.fee_amount is not None:
        return booking.fee_amount
    # Legacy bookings have the original common fee, never a new gender override.
    return game.fixed_fee if member.kind == 'fixed' else game.guest_fee


def confirm_count(db: Session, game_id: int):
    return db.scalar(select(func.count()).select_from(Booking).where(Booking.session_id==game_id, Booking.status=='confirmed')) or 0


def has_space(db,game,gender):
    if confirm_count(db,game.id)>=game.capacity:return False
    if gender=='unspecified' and (game.capacity_male is not None or game.capacity_female is not None):return False
    quota=getattr(game,'capacity_'+gender,None) if gender in ('male','female') else None
    if quota is None:return True
    count=db.scalar(select(func.count()).select_from(Booking).where(Booking.session_id==game.id,
        Booking.status=='confirmed',Booking.gender_at_booking==gender)) or 0
    return count<quota


@app.get('/', response_class=HTMLResponse)
def home(request: Request, db: Session=Depends(db_session)):
    if current_host(request,db): return redirect('/dashboard')
    return redirect('/login')

@app.get('/signup', response_class=HTMLResponse)
def signup_page(request: Request): return page(request,'auth.html', mode='signup', error=None)

@app.post('/signup')
def signup(request: Request, email: str=Form(), password: str=Form(), csrf: str=Form(), db: Session=Depends(db_session)):
    ensure_csrf(request,csrf)
    from app.security import rate_limit
    rate_limit(request,'signup',limit=100,seconds=3600)
    email = email.strip().lower()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',email) or not 10<=len(password)<=256 or len(email)>254:
        return page(request,'auth.html',mode='signup',error='Email không hợp lệ hoặc mật khẩu dưới 10 ký tự')
    if db.scalar(select(Host).where(Host.email==email)):
        return page(request,'auth.html',mode='signup',error='Email đã được sử dụng')
    host=Host(email=email,password_hash=hashed_password(password)); db.add(host); db.commit()
    response=redirect('/dashboard')
    response.set_cookie('clubhost', signer.dumps({'id':host.id,'v':host.session_version}), httponly=True, secure=COOKIE_SECURE, samesite='lax', max_age=60*60*24*14)
    return response

@app.get('/login', response_class=HTMLResponse)
def login_page(request: Request): return page(request,'auth.html',mode='login',error=None)

@app.post('/login')
def login(request: Request, email: str=Form(), password: str=Form(), csrf: str=Form(),db:Session=Depends(db_session)):
    ensure_csrf(request,csrf)
    from app.security import rate_limit
    rate_limit(request,'login',limit=30,seconds=300)
    if len(password)>256:raise HTTPException(400,'Invalid password')
    host=db.scalar(select(Host).where(Host.email==email.strip().lower()))
    if not host or not check_password(password, host.password_hash):
        return page(request,'auth.html',mode='login',error='Email hoặc mật khẩu không đúng')
    response=redirect('/dashboard')
    response.set_cookie('clubhost', signer.dumps({'id':host.id,'v':host.session_version}), httponly=True, secure=COOKIE_SECURE, samesite='lax', max_age=60*60*24*14)
    return response

@app.post('/logout')
def logout(request:Request,csrf:str=Form()):
    ensure_csrf(request,csrf)
    response=redirect('/login');response.delete_cookie('clubhost'); return response

@app.get('/dashboard',response_class=HTMLResponse)
def dashboard(request:Request,db:Session=Depends(db_session)):
    host=require_host(request,db)
    from app.workspace import render_dashboard
    return render_dashboard(request,db,host)

@app.post('/clubs')
def create_club(request:Request,name:str=Form(),location:str=Form(''),csrf:str=Form(),db:Session=Depends(db_session)):
    host=require_host(request,db);ensure_csrf(request,csrf)
    if not (1<=len(name.strip())<=100): raise HTTPException(400,'Invalid club name')
    from datetime import timedelta
    club=Club(owner_id=host.id,name=name.strip(),location=location.strip()[:180],trial_ends_at=(datetime.now(timezone.utc)+timedelta(days=30)).isoformat());db.add(club);db.commit()
    return redirect(f'/clubs/{club.id}')

@app.get('/clubs/{club_id}',response_class=HTMLResponse)
def club_page(request:Request,club_id:int,db:Session=Depends(db_session)):
    host,club=owned_club(request,db,club_id)
    members=db.scalars(select(Member).where(Member.club_id==club_id).order_by(Member.kind,Member.name)).all()
    games=db.scalars(select(GameSession).where(GameSession.club_id==club_id).order_by(GameSession.starts_at.desc())).all()
    periods=db.scalars(select(MonthlyDue).join(Member,MonthlyDue.member_id==Member.id).where(Member.club_id==club_id).order_by(MonthlyDue.period.desc())).all()
    dues_info=[{'item':due,'member':next(m for m in members if m.id==due.member_id)} for due in periods]
    from app.workspace import context,game_rows
    rows=game_rows(context(db,host,club_id))
    for due in periods:
        if not due.access_key:due.access_key=secrets.token_urlsafe(24)
    db.commit()
    return page(request,'club.html',host=host,club=club,members=members,games=games,dues=dues_info,game_rows=rows)

@app.post('/clubs/{club_id}/settings')
def update_club(request:Request,club_id:int,name:str=Form(),location:str=Form(''),csrf:str=Form(),db:Session=Depends(db_session)):
    _,club=owned_club(request,db,club_id,permission='owner');ensure_csrf(request,csrf)
    if not (1<=len(name.strip())<=100):raise HTTPException(400,'Invalid club name')
    club.name=name.strip();club.location=location.strip()[:180]
    db.commit();return redirect(f'/clubs/{club_id}')

@app.post('/clubs/{club_id}/members/{member_id}/edit')
def update_member(request:Request,club_id:int,member_id:int,name:str=Form(),phone:str=Form(),kind:str=Form(),level:str=Form(''),gender:str|None=Form(None),csrf:str=Form(),db:Session=Depends(db_session)):
    owned_club(request,db,club_id);ensure_csrf(request,csrf)
    member=db.get(Member,member_id)
    if not member or member.club_id!=club_id: raise HTTPException(404,'Member not found')
    if not name.strip() or kind not in ('fixed','guest'):raise HTTPException(400,'Invalid member')
    if gender is not None:
        member.gender = validated_gender(gender)
        for booking in db.scalars(select(Booking).where(Booking.member_id==member.id,Booking.status!='confirmed')):
            booking.gender_at_booking=member.gender
    phone=digits_phone(phone)
    conflict=db.scalar(select(Member).where(Member.club_id==club_id,Member.phone.in_(phone_aliases(phone)),Member.id!=member_id))
    if conflict:return redirect(f'/clubs/{club_id}?message=phone_exists')
    member.name=name.strip()[:100];member.phone=phone;member.kind=kind;member.level=level.strip()[:40]
    db.commit();return redirect(f'/clubs/{club_id}')

@app.post('/clubs/{club_id}/members')
def add_member(request:Request,club_id:int,name:str=Form(),phone:str=Form(),kind:str=Form(),level:str=Form(''),gender:str=Form('unspecified'),csrf:str=Form(),db:Session=Depends(db_session)):
    owned_club(request,db,club_id);ensure_csrf(request,csrf)
    if kind not in ('fixed','guest') or not name.strip(): raise HTTPException(400,'Invalid member')
    gender = validated_gender(gender)
    phone=digits_phone(phone)
    existing=member_by_phone(db,club_id,phone)
    if existing: return redirect(f'/clubs/{club_id}?message=phone_exists')
    db.add(Member(club_id=club_id,name=name.strip()[:100],phone=phone,kind=kind,gender=gender,level=level.strip()[:40]));db.commit()
    return redirect(f'/clubs/{club_id}')

@app.post('/clubs/{club_id}/games')
def create_game(request:Request,club_id:int,title:str=Form(),venue:str=Form(''),starts_at:str=Form(),capacity:int=Form(),fixed_fee:int=Form(0),guest_fee:int=Form(0),fixed_fee_male:str=Form(''),fixed_fee_female:str=Form(''),guest_fee_male:str=Form(''),guest_fee_female:str=Form(''),csrf:str=Form(),db:Session=Depends(db_session)):
    owned_club(request,db,club_id);ensure_csrf(request,csrf)
    try: datetime.strptime(starts_at,'%Y-%m-%dT%H:%M')
    except ValueError: raise HTTPException(400,'Invalid start time')
    if not 1<=capacity<=200 or not title.strip(): raise HTTPException(400,'Invalid game')
    game=GameSession(club_id=club_id,public_id=secrets.token_urlsafe(18),title=title.strip()[:150],venue=venue.strip()[:180],starts_at=starts_at,capacity=capacity,fixed_fee=money(fixed_fee),guest_fee=money(guest_fee),fixed_fee_male=optional_money(fixed_fee_male),fixed_fee_female=optional_money(fixed_fee_female),guest_fee_male=optional_money(guest_fee_male),guest_fee_female=optional_money(guest_fee_female))
    db.add(game);db.commit();return redirect(f'/games/{game.id}')

@app.post('/clubs/{club_id}/dues')
def add_due(request:Request,club_id:int,member_id:int=Form(),period:str=Form(),amount:int=Form(),csrf:str=Form(),db:Session=Depends(db_session)):
    owned_club(request,db,club_id,permission='finance');ensure_csrf(request,csrf)
    m=db.get(Member,member_id)
    if not m or m.club_id!=club_id or m.kind!='fixed':raise HTTPException(400,'Invalid member')
    if not re.fullmatch(r'20\d\d-(0[1-9]|1[0-2])',period):raise HTTPException(400,'Invalid period')
    due=db.scalar(select(MonthlyDue).where(MonthlyDue.member_id==member_id,MonthlyDue.period==period))
    if due:
        if due.paid and due.amount!=money(amount):raise HTTPException(409,'Hoàn tác đã thu trước khi sửa số tiền')
        due.amount=money(amount)
    else: db.add(MonthlyDue(member_id=member_id,period=period,amount=money(amount),qr_key=db.get(Club,club_id).qr_key))
    db.commit();return redirect(f'/clubs/{club_id}')

@app.post('/dues/{due_id}/toggle')
def toggle_due(request:Request,due_id:int,csrf:str=Form(),db:Session=Depends(db_session)):
    due=db.get(MonthlyDue,due_id)
    if not due:raise HTTPException(404)
    member=db.get(Member,due.member_id)
    host,club=owned_club(request,db,member.club_id,permission='finance');ensure_csrf(request,csrf)
    due.paid=not due.paid;due.payment_status='confirmed' if due.paid else 'unpaid'
    from app.workspace import audit
    audit(db,club.id,host.id,'Cập nhật phí tháng',f'Khoản #{due.id}: {due.payment_status}')
    db.commit();return host_redirect(request,f'/clubs/{member.club_id}')

@app.get('/games/{game_id}',response_class=HTMLResponse)
def game_page(request:Request,game_id:int,db:Session=Depends(db_session)):
    game,club=owned_session(request,db,game_id)
    host=require_host(request,db)
    members=db.scalars(select(Member).where(Member.club_id==club.id,Member.kind=='fixed').order_by(Member.name)).all()
    bookings=db.scalars(select(Booking).where(Booking.session_id==game_id).order_by(Booking.id.desc())).all()
    member_by_id={m.id:m for m in db.scalars(select(Member).where(Member.club_id==club.id)).all()}
    expenses=db.scalars(select(Expense).where(Expense.session_id==game_id)).all()
    rows=[{'booking':b,'member':member_by_id[b.member_id], 'fee':booking_fee(game,b,member_by_id[b.member_id])} for b in bookings]
    total_collected=sum(r['fee'] for r in rows if r['booking'].status=='confirmed' and r['booking'].paid)
    total_due=sum(r['fee'] for r in rows if r['booking'].status=='confirmed' and not r['booking'].paid)
    total_expenses=sum(e.amount for e in expenses)
    gender_counts = {key: sum(r['booking'].status == 'confirmed' and r['member'].gender == key for r in rows) for key in GENDER_LABELS}
    from app.payments import can_finance
    for booking in bookings:
        if not booking.access_key:booking.access_key=secrets.token_urlsafe(24)
    db.commit()
    return page(request,'game.html',host=host,game=game,club=club,rows=rows,members=members,expenses=expenses,confirmed=confirm_count(db,game.id),gender_counts=gender_counts,collected=total_collected,receivable=total_due,outgoing=total_expenses,can_finance_club=can_finance(db,host,club),join_url=str(request.base_url).rstrip('/')+f'/join/{game.public_id}')

@app.post('/games/{game_id}/fixed')
def add_fixed_to_game(request:Request,game_id:int,member_id:int=Form(),csrf:str=Form(),db:Session=Depends(db_session)):
    game,club=owned_session(request,db,game_id,lock=True);ensure_csrf(request,csrf)
    if game.is_cancelled:raise HTTPException(400,'Session cancelled')
    member=db.get(Member,member_id)
    if not member or member.club_id!=club.id or member.kind!='fixed':raise HTTPException(400)
    booking=db.scalar(select(Booking).where(Booking.session_id==game_id,Booking.member_id==member_id))
    if not booking:
        if not has_space(db,game,member.gender):return redirect(f'/games/{game_id}?message=full')
        db.add(Booking(session_id=game_id,member_id=member_id,status='confirmed',fee_amount=member_fee(game,member),qr_key=club.qr_key,gender_at_booking=member.gender))
    elif booking.status != 'confirmed':
        if not has_space(db,game,booking.gender_at_booking):return redirect(f'/games/{game_id}?message=full')
        booking.status='confirmed'
    db.commit();return redirect(f'/games/{game_id}')

@app.post('/games/{game_id}/bookings/{booking_id}/{action}')
def change_booking(request:Request,game_id:int,booking_id:int,action:str,csrf:str=Form(),db:Session=Depends(db_session)):
    permission='finance' if action in ('paid','unpaid','refund') else 'manage'
    game,club=owned_session(request,db,game_id,lock=True,permission=permission);ensure_csrf(request,csrf)
    booking=db.get(Booking,booking_id)
    if not booking or booking.session_id!=game_id:raise HTTPException(404)
    previous_status=booking.status
    if action=='approve':
        if game.is_cancelled:raise HTTPException(400,'Buổi đánh đã hủy')
        if booking.status!='confirmed' and not has_space(db,game,booking.gender_at_booking):return redirect(f'/games/{game_id}?message=full')
        booking.status='confirmed'
    elif action=='waitlist':booking.status='waitlist'
    elif action=='cancel':booking.status='cancelled'
    elif action=='paid':booking.paid=True;booking.payment_status='confirmed'
    elif action=='unpaid':booking.paid=False;booking.payment_status='unpaid'
    elif action=='refund':booking.paid=False;booking.payment_status='refunded'
    elif action=='attended':booking.attended=True
    elif action=='absent':booking.attended=False
    else:raise HTTPException(400,'Invalid action')
    if previous_status=='confirmed' and booking.status!='confirmed':
        from app.payments import promote_waitlist
        db.flush();promote_waitlist(db,game,exclude_id=booking.id)
    if action=='paid':
        for proof in db.scalars(select(PaymentProof).where(PaymentProof.booking_id==booking.id,PaymentProof.status=='reported')):
            proof.status='confirmed';proof.reviewed_by=require_host(request,db).id
            proof.reviewed_at=datetime.now(timezone.utc).isoformat();proof.note='Host ghi nhận đã thu trực tiếp'
    from app.workspace import audit
    audit(db,club.id,require_host(request,db).id,'Cập nhật booking',f'#{booking.id}: {action}')
    db.commit();return redirect(f'/games/{game_id}')

@app.post('/games/{game_id}/toggle-open')
def toggle_open(request:Request,game_id:int,csrf:str=Form(),db:Session=Depends(db_session)):
    game,_=owned_session(request,db,game_id);ensure_csrf(request,csrf)
    if game.is_cancelled:raise HTTPException(400,'Session cancelled')
    game.is_open=not game.is_open;db.commit();return redirect(f'/games/{game_id}')

@app.post('/games/{game_id}/expenses')
def add_expense(request:Request,game_id:int,title:str=Form(),amount:int=Form(),csrf:str=Form(),db:Session=Depends(db_session)):
    owned_session(request,db,game_id,permission='finance');ensure_csrf(request,csrf)
    if not title.strip():raise HTTPException(400,'Missing description')
    db.add(Expense(session_id=game_id,title=title.strip()[:100],amount=money(amount)));db.commit();return redirect(f'/games/{game_id}')

def guest_review(game: GameSession, phone: str, member: Member | None):
    profile = {'phone': phone, 'name': member.name if member else '',
               'gender': member.gender if member else 'unspecified',
               'level': member.level if member else '', 'kind': member.kind if member else 'guest',
               'found': member is not None, 'fee': member_fee(game, member) if member else None}
    token = lookup_signer.dumps({'game': game.public_id, 'phone': phone,
                                'member': member.id if member else None,
                                'profile': [profile[k] for k in ('name', 'gender', 'level', 'kind', 'fee')]})
    return {**profile, 'token': token}


def join_view(request: Request, db: Session, game: GameSession, *, lookup=None, error=None, phone=''):
    club=db.get(Club,game.club_id)
    own_link=None
    try:
        payload=signer.loads(request.cookies.get('sporthost_booking_'+game.public_id,''),max_age=60*60*24*30)
        booking=db.get(Booking,payload['booking'])
        if booking and booking.session_id==game.id and secrets.compare_digest(booking.access_key,payload['key']):own_link='/attend/'+booking.access_key
    except (BadSignature,KeyError,TypeError):pass
    response = page(request,'join.html',game=game,club=club,confirmed=confirm_count(db,game.id),
                    message=request.query_params.get('message'),lookup=lookup,lookup_error=error,phone=phone,guest_open=guest_open(game),own_link=own_link)
    response.headers['Cache-Control'] = 'private, no-store'
    return response


@app.get('/join/{public_id}',response_class=HTMLResponse)
def join_page(request:Request,public_id:str,db:Session=Depends(db_session)):
    game=db.scalar(select(GameSession).where(GameSession.public_id==public_id))
    if not game:raise HTTPException(404)
    return join_view(request, db, game)


@app.post('/join/{public_id}/lookup', response_class=HTMLResponse)
def lookup_guest(request:Request,public_id:str,phone:str=Form(),csrf:str=Form(),db:Session=Depends(db_session)):
    ensure_csrf(request,csrf)
    game=db.scalar(select(GameSession).where(GameSession.public_id==public_id))
    if not game:raise HTTPException(404)
    if not guest_open(game):return redirect(f'/join/{public_id}?message=closed')
    limit_guest_lookup(request, public_id)
    from app.security import rate_limit
    rate_limit(request,'lookup:'+public_id,limit=60,seconds=60)
    try:
        phone = digits_phone(phone)
    except HTTPException:
        return join_view(request, db, game, error='Số điện thoại chưa hợp lệ. Vui lòng kiểm tra lại.', phone=phone[:22])
    member = member_by_phone(db, game.club_id, phone)
    return join_view(request, db, game, lookup=guest_review(game, phone, member))

@app.post('/join/{public_id}')
def join(request:Request,public_id:str,name:str=Form(),phone:str=Form(),level:str=Form(''),gender:str=Form('unspecified'),lookup_token:str=Form(''),csrf:str=Form(),db:Session=Depends(db_session)):
    ensure_csrf(request,csrf)
    from app.security import rate_limit
    rate_limit(request,'join:'+public_id,limit=30,seconds=300)
    game=db.scalar(select(GameSession).where(GameSession.public_id==public_id).with_for_update())
    if not game:raise HTTPException(404)
    if not guest_open(game):return redirect(f'/join/{public_id}?message=closed')
    db.execute(select(Club).where(Club.id==game.club_id).with_for_update())
    if not name.strip():raise HTTPException(400,'Name required')
    gender = validated_gender(gender)
    phone=digits_phone(phone)
    member=member_by_phone(db,game.club_id,phone)
    if lookup_token:
        try:
            reviewed = lookup_signer.loads(lookup_token, max_age=60*15)
            if reviewed['game'] != public_id or reviewed['phone'] != phone:
                raise BadSignature('Review belongs to a different phone or session')
        except (BadSignature, SignatureExpired, KeyError):
            raise HTTPException(403, 'Invalid or expired review; look up your phone again')
        current = guest_review(game, phone, member)
        profile = [current[k] for k in ('name', 'gender', 'level', 'kind', 'fee')]
        if reviewed.get('member') != (member.id if member else None) or reviewed.get('profile') != profile:
            return join_view(request, db, game, lookup=current,
                             error='Thông tin vừa được cập nhật. Vui lòng kiểm tra và xác nhận lại.')
    if member and member.kind=='fixed':return redirect(f'/join/{public_id}?message=fixed')
    if not member:
        member=Member(club_id=game.club_id,name=name.strip()[:100],phone=phone,kind='guest',gender=gender,level=level.strip()[:40]);db.add(member);db.flush()
    existing=db.scalar(select(Booking).where(Booking.session_id==game.id,Booking.member_id==member.id))
    if existing and existing.status not in ('cancelled',):return redirect(f'/join/{public_id}?message=already')
    if existing:
        existing.status='pending'
        if not existing.paid:existing.fee_amount=member_fee(game,member)
    else: db.add(Booking(session_id=game.id,member_id=member.id,status='pending',fee_amount=member_fee(game,member),qr_key=db.get(Club,game.club_id).qr_key,gender_at_booking=member.gender))
    db.flush()
    booking=existing or db.scalar(select(Booking).where(Booking.session_id==game.id,Booking.member_id==member.id))
    db.commit()
    response=redirect(f'/join/{public_id}?message=success')
    response.set_cookie('sporthost_booking_'+public_id,signer.dumps({'booking':booking.id,'key':booking.access_key}),httponly=True,secure=COOKIE_SECURE,samesite='lax',max_age=60*60*24*30)
    return response

@app.get('/games/{game_id}/export.csv')
def export_game(request:Request,game_id:int,db:Session=Depends(db_session)):
    game,_=owned_session(request,db,game_id)
    bookings=db.scalars(select(Booking).where(Booking.session_id==game_id)).all()
    buf=io.StringIO();w=csv.writer(buf);w.writerow(['Họ tên','Số điện thoại','Giới tính','Loại','Trình độ','Trạng thái','Phí buổi (VND)','Đã thu','Đã điểm danh'])
    for b in bookings:
        m=db.get(Member,b.member_id)
        w.writerow([m.name,m.phone,GENDER_LABELS[m.gender],m.kind,m.level,b.status,booking_fee(game,b,m),'Có' if b.paid else 'Không','Có' if b.attended else 'Không'])
    return StreamingResponse(iter([buf.getvalue().encode('utf-8-sig')]),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':f'attachment; filename="sporthost-game-{game_id}.csv"'})

@app.get('/health')
def health():
    # Liveness intentionally does not touch the DB.
    return {'ok': True}

@app.get('/ready')
def readiness(db: Session=Depends(db_session)):
    # Read-only readiness probe, no credentials or DB internals disclosed.
    try:
        # Also detect missing migrations and missing runtime table permissions.
        db.execute(select(Host).limit(1))
    except Exception:
        raise HTTPException(503, 'Database not ready')
    return {'ok': True}



def guest_open(game):
    if not game.is_open or game.is_cancelled:return False
    now=datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).strftime('%Y-%m-%dT%H:%M')
    return not game.recurring_rule_id or not game.rsvp_deadline or now>=game.rsvp_deadline


from app import workspace, payments, accounts
workspace.register_routes()
payments.register_routes()
accounts.register_routes()


@app.exception_handler(StarletteHTTPException)
async def friendly_http_error(request,exc):
    if 'text/html' not in request.headers.get('accept',''):
        return await http_exception_handler(request,exc)
    status=exc.status_code
    headings={400:'Kiểm tra lại thông tin',401:'Cần đăng nhập để tiếp tục',403:'Bạn chưa có quyền thực hiện',
        404:'Không tìm thấy trang này',409:'Thông tin vừa thay đổi',413:'Ảnh vượt kích thước cho phép',
        429:'Bạn thao tác quá nhanh',503:'Chức năng đang được cấu hình'}
    messages={401:'Đăng nhập tài khoản host để mở trang quản lý.',403:'Liên hệ chủ CLB nếu bạn cần thêm quyền.',
        404:'Link có thể chưa đúng hoặc không còn khả dụng.',429:'Vui lòng chờ một lát rồi thử lại.'}
    detail=str(exc.detail)
    response=page(request,'error.html',status=status,heading=headings.get(status,'Chưa thể thực hiện thao tác'),
        message=messages.get(status,detail if detail not in ('Bad Request','Conflict','Service Unavailable') else 'Vui lòng thử lại sau.'))
    response.status_code=status
    response.headers.update(exc.headers or {})
    return response


@app.exception_handler(RequestValidationError)
async def friendly_validation_error(request,exc):
    if 'text/html' not in request.headers.get('accept',''):
        return await request_validation_exception_handler(request,exc)
    return await friendly_http_error(request,HTTPException(400,'Vui lòng điền đủ các trường bắt buộc và kiểm tra định dạng dữ liệu.'))
