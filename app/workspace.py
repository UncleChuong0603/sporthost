"""Host workspace queries, scheduling, co-host and finance routes."""
import csv
import io
import secrets
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, Form, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func

from app.main import (app, Host, Club, Member, GameSession, Booking, Expense, MonthlyDue,
    RecurringRule, ClubAccess, AuditLog, PaymentProof, SubscriptionRequest, SessionLocal,
    db_session, require_host, owned_club, owned_session, accessible_clubs, ensure_csrf,
    page, redirect, money, optional_money, member_fee, booking_fee, signer)

LOCAL_TZ=ZoneInfo('Asia/Ho_Chi_Minh')


def now_local():return datetime.now(LOCAL_TZ)
def now_iso():return datetime.now(timezone.utc).isoformat()


def audit(db, club_id, host_id, action, details=''):
    db.add(AuditLog(club_id=club_id,host_id=host_id,action=action,details=details[:500]))


def context(db,host,club_id=None):
    if club_id in ('',None):club_id=None
    elif not str(club_id).isdigit():raise HTTPException(400,'CLB không hợp lệ')
    else:club_id=int(club_id)
    clubs=accessible_clubs(db,host)
    if club_id is not None and club_id not in {c.id for c in clubs}:raise HTTPException(404)
    selected=[c for c in clubs if club_id is None or c.id==club_id]
    ids=[c.id for c in selected]
    members=db.scalars(select(Member).where(Member.club_id.in_(ids)).order_by(Member.name)).all()
    games=db.scalars(select(GameSession).where(GameSession.club_id.in_(ids)).order_by(GameSession.starts_at.desc())).all()
    bookings=db.scalars(select(Booking).where(Booking.session_id.in_([g.id for g in games]))).all()
    return {'clubs':clubs,'selected_club':next((c for c in clubs if c.id==club_id),None),
            'members':members,'games':games,'bookings':bookings,'club_map':{c.id:c for c in clubs},'club_id':club_id}


def game_rows(data):
    rows=[]
    for game in data['games']:
        bookings=[b for b in data['bookings'] if b.session_id==game.id]
        confirmed=sum(b.status=='confirmed' for b in bookings)
        pending=sum(b.status in ('pending','waitlist') for b in bookings)
        rows.append({'game':game,'club':data['club_map'][game.club_id],'confirmed':confirmed,
                     'pending':pending,'slots':max(0,game.capacity-confirmed),
                     'day':game.starts_at[8:10],'month':game.starts_at[5:7]})
    return rows


def ledger(db,data):
    members={m.id:m for m in data['members']};games={g.id:g for g in data['games']};rows=[]
    for booking in data['bookings']:
        if booking.status not in ('confirmed','cancelled') and not booking.paid:continue
        game=games[booking.session_id];member=members[booking.member_id]
        amount=booking_fee(game,booking,member)
        rows.append({'type':'booking','id':booking.id,'game_id':game.id,'club_id':game.club_id,
          'title':member.name,'description':game.title,'period':game.starts_at[:7],'date':game.starts_at[:10],
          'amount':amount,'paid':booking.paid,'status':booking.payment_status,
          'cancelled':booking.status=='cancelled','direction':'income'})
    dues=db.scalars(select(MonthlyDue).where(MonthlyDue.member_id.in_(members))).all()
    for due in dues:
        member=members[due.member_id]
        rows.append({'type':'due','id':due.id,'club_id':member.club_id,'title':member.name,'description':'Phí tháng '+due.period,
          'period':due.period,'date':due.period,'amount':due.amount,'paid':due.paid,'status':due.payment_status,
          'cancelled':False,'direction':'income'})
    expenses=db.scalars(select(Expense).where(Expense.session_id.in_(games))).all()
    for expense in expenses:
        game=games[expense.session_id]
        rows.append({'type':'expense','id':expense.id,'game_id':game.id,'club_id':game.club_id,'title':expense.title,
          'description':game.title,'period':game.starts_at[:7],'date':game.starts_at[:10],
          'amount':expense.amount,'paid':True,'status':'confirmed','cancelled':False,'direction':'expense'})
    return sorted(rows,key=lambda row:(row['date'],row['id']),reverse=True)


def totals(rows):
    return {'received':sum(r['amount'] for r in rows if r['direction']=='income' and r['paid']),
            'outstanding':sum(r['amount'] for r in rows if r['direction']=='income' and not r['paid'] and not r['cancelled']),
            'expenses':sum(r['amount'] for r in rows if r['direction']=='expense')}


def render_dashboard(request,db,host):
    data=context(db,host);now=now_local().strftime('%Y-%m-%dT%H:%M')
    upcoming=sorted([r for r in game_rows(data) if r['game'].starts_at>=now and not r['game'].is_cancelled],key=lambda r:r['game'].starts_at)
    pending=[b for b in data['bookings'] if b.status=='pending']
    members={m.id:m for m in data['members']};games={g.id:g for g in data['games']}
    requests=[{'booking':b,'member':members[b.member_id],'game':games[b.session_id]} for b in pending[:5]]
    month=now[:7];financial=totals([r for r in ledger(db,data) if r['period']==month])
    return page(request,'dashboard.html',host=host,**data,upcoming=upcoming[:5],upcoming_count=len(upcoming),
                pending_count=len(pending),requests=requests,financial=financial,today=now_local().strftime('%d/%m/%Y'),month=month)


def prices(form):
    values={name:money(form.get(name,0)) for name in ('fixed_fee','guest_fee')}
    values.update({name:optional_money(str(form.get(name,'') or '')) for name in ('fixed_fee_male','fixed_fee_female','guest_fee_male','guest_fee_female')})
    return values


def generate_rule(db,rule):
    db.execute(select(RecurringRule).where(RecurringRule.id==rule.id).with_for_update())
    existing=set(db.scalars(select(GameSession.starts_at).where(GameSession.recurring_rule_id==rule.id)))
    fixed=db.scalars(select(Member).where(Member.club_id==rule.club_id,Member.kind=='fixed')).all()
    club=db.get(Club,rule.club_id);created=0
    for week in range(rule.weeks):
        start=datetime.strptime(rule.first_start,'%Y-%m-%dT%H:%M')+timedelta(weeks=week)
        starts_at=start.strftime('%Y-%m-%dT%H:%M')
        if starts_at in existing:continue
        game=GameSession(club_id=rule.club_id,recurring_rule_id=rule.id,public_id=secrets.token_urlsafe(18),
            title=rule.title,venue=rule.venue,starts_at=starts_at,capacity=rule.capacity,
            rsvp_deadline=(start-timedelta(hours=rule.rsvp_hours)).strftime('%Y-%m-%dT%H:%M'),
            capacity_male=rule.capacity_male,capacity_female=rule.capacity_female,
            **{name:getattr(rule,name) for name in ('fixed_fee','guest_fee','fixed_fee_male','fixed_fee_female','guest_fee_male','guest_fee_female')})
        db.add(game);db.flush()
        for member in fixed:db.add(Booking(session_id=game.id,member_id=member.id,status='invited',fee_amount=member_fee(game,member),qr_key=club.qr_key,gender_at_booking=member.gender))
        created+=1
    return created


def quotas(form,capacity):
    values={}
    for gender in ('male','female'):
        raw=str(form.get('capacity_'+gender,'')).strip()
        if not raw:values['capacity_'+gender]=None;continue
        try:value=int(raw)
        except ValueError:raise HTTPException(400,'Giới hạn nam/nữ phải là số nguyên')
        if not 0<=value<=capacity:raise HTTPException(400,'Giới hạn nam/nữ cần từ 0 đến sức chứa chung')
        values['capacity_'+gender]=value
    return values


def register_routes():
    @app.post('/games/{game_id}/invite-fixed')
    def invite_fixed(request:Request,game_id:int,csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);game,club=owned_session(request,db,game_id,lock=True)
        if game.is_cancelled:raise HTTPException(400,'Buổi đánh đã hủy')
        existing=set(db.scalars(select(Booking.member_id).where(Booking.session_id==game_id)))
        for member in db.scalars(select(Member).where(Member.club_id==club.id,Member.kind=='fixed')):
            if member.id not in existing:
                db.add(Booking(session_id=game_id,member_id=member.id,status='invited',fee_amount=member_fee(game,member),qr_key=club.qr_key,gender_at_booking=member.gender))
        audit(db,club.id,require_host(request,db).id,'Tạo link RSVP cho member',game.title);db.commit()
        return redirect(f'/games/{game_id}')

    @app.post('/games/{game_id}/settings')
    async def edit_game(request:Request,game_id:int,db=Depends(db_session)):
        form=await request.form();ensure_csrf(request,form.get('csrf',''));game,club=owned_session(request,db,game_id,lock=True)
        if game.is_cancelled:raise HTTPException(400,'Buổi đánh đã hủy')
        try:
            capacity=int(form.get('capacity',0));starts_at=datetime.strptime(form.get('starts_at',''),'%Y-%m-%dT%H:%M')
        except (TypeError,ValueError):raise HTTPException(400,'Thông tin buổi đánh chưa hợp lệ')
        count=db.scalar(select(func.count()).select_from(Booking).where(Booking.session_id==game.id,Booking.status=='confirmed'))
        if not max(1,count)<=capacity<=200:raise HTTPException(400,'Sức chứa không được thấp hơn số người đã xác nhận')
        limits=quotas(form,capacity)
        for gender in ('male','female'):
            count_gender=db.scalar(select(func.count()).select_from(Booking).where(Booking.session_id==game.id,
                Booking.status=='confirmed',Booking.gender_at_booking==gender))
            if limits['capacity_'+gender] is not None and limits['capacity_'+gender]<count_gender:
                raise HTTPException(400,'Giới hạn nam/nữ không được thấp hơn số người đã xác nhận')
        for name,value in limits.items():setattr(game,name,value)
        title=str(form.get('title','')).strip()
        if not title or len(title)>150:raise HTTPException(400,'Tên buổi đánh chưa hợp lệ')
        game.title=title;game.venue=str(form.get('venue','')).strip()[:180];game.starts_at=starts_at.strftime('%Y-%m-%dT%H:%M');game.capacity=capacity
        audit(db,club.id,require_host(request,db).id,'Sửa thông tin buổi đánh',game.title);db.commit()
        return redirect(f'/games/{game_id}')

    @app.post('/rules/{rule_id}/stop')
    def stop_rule(request:Request,rule_id:int,csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);rule=db.scalar(select(RecurringRule).where(RecurringRule.id==rule_id).with_for_update())
        if not rule:raise HTTPException(404)
        host,club=owned_club(request,db,rule.club_id);rule.active=False
        audit(db,club.id,host.id,'Dừng lịch lặp',rule.title);db.commit()
        return redirect(f'/schedule?club_id={club.id}')

    @app.post('/rules/{rule_id}/extend')
    def extend_rule(request:Request,rule_id:int,weeks:int=Form(4),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);rule=db.scalar(select(RecurringRule).where(RecurringRule.id==rule_id).with_for_update())
        if not rule:raise HTTPException(404)
        host,club=owned_club(request,db,rule.club_id)
        if not rule.active or not 1<=weeks<=12 or rule.weeks+weeks>52:raise HTTPException(400,'Lịch lặp cần hoạt động; tối đa 52 tuần')
        rule.weeks+=weeks;count=generate_rule(db,rule)
        audit(db,club.id,host.id,'Gia hạn lịch lặp',f'{count} buổi mới');db.commit()
        return redirect(f'/schedule?club_id={club.id}')

    @app.get('/clubs')
    def clubs_page(request:Request,db=Depends(db_session)):
        host=require_host(request,db);data=context(db,host)
        return page(request,'clubs.html',host=host,**data)

    @app.get('/schedule')
    def schedule_page(request:Request,club_id:str|None=None,q:str='',status:str='',db=Depends(db_session)):
        host=require_host(request,db);data=context(db,host,club_id);rows=game_rows(data)
        now=now_local().strftime('%Y-%m-%dT%H:%M')
        if q:rows=[r for r in rows if q.casefold() in (r['game'].title+' '+r['game'].venue).casefold()]
        if status=='upcoming':rows=[r for r in rows if r['game'].starts_at>=now and not r['game'].is_cancelled]
        elif status=='past':rows=[r for r in rows if r['game'].starts_at<now]
        elif status=='open':rows=[r for r in rows if r['game'].is_open and not r['game'].is_cancelled]
        elif status=='cancelled':rows=[r for r in rows if r['game'].is_cancelled]
        rules=db.scalars(select(RecurringRule).where(RecurringRule.club_id.in_([c.id for c in data['clubs']]))).all()
        return page(request,'schedule.html',host=host,**data,rows=rows,q=q,status=status,rules=rules)

    @app.post('/workspace/games')
    async def workspace_create_game(request:Request,db=Depends(db_session)):
        form=await request.form();ensure_csrf(request,form.get('csrf',''))
        try:club_id=int(form.get('club_id',0))
        except (TypeError,ValueError):raise HTTPException(400,'CLB không hợp lệ')
        host,club=owned_club(request,db,club_id)
        try:
            start=datetime.strptime(form.get('starts_at',''),'%Y-%m-%dT%H:%M')
            capacity=int(form.get('capacity',0));weeks=int(form.get('weeks',1));rsvp_hours=int(form.get('rsvp_hours',24))
        except (ValueError,TypeError):raise HTTPException(400,'Kiểm tra lại thời gian và số lượng')
        if not 1<=capacity<=200 or not 1<=weeks<=12 or not 0<=rsvp_hours<=168:raise HTTPException(400,'Giới hạn: 200 chỗ, 12 tuần, hạn RSVP tối đa 168 giờ')
        title=str(form.get('title','')).strip();venue=str(form.get('venue','')).strip()
        if not title or len(title)>150:raise HTTPException(400,'Tên buổi đánh không hợp lệ')
        values={**prices(form),**quotas(form,capacity)}
        if weeks>1:
            rule=RecurringRule(club_id=club_id,title=title,venue=venue[:180],first_start=start.strftime('%Y-%m-%dT%H:%M'),
                weeks=weeks,capacity=capacity,rsvp_hours=rsvp_hours,**values)
            db.add(rule);db.flush();count=generate_rule(db,rule)
            audit(db,club_id,host.id,'Tạo lịch lặp',f'{title}: {count} buổi')
            db.commit();return redirect(f'/schedule?club_id={club_id}')
        game=GameSession(club_id=club_id,title=title,venue=venue[:180],starts_at=start.strftime('%Y-%m-%dT%H:%M'),
                         public_id=secrets.token_urlsafe(18),capacity=capacity,**values)
        db.add(game);audit(db,club_id,host.id,'Tạo buổi đánh',title);db.commit()
        return redirect(f'/games/{game.id}')

    @app.post('/rules/{rule_id}/generate')
    def regenerate(request:Request,rule_id:int,csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);rule=db.get(RecurringRule,rule_id)
        if not rule:raise HTTPException(404)
        host,club=owned_club(request,db,rule.club_id)
        if not rule.active:raise HTTPException(400,'Lịch lặp đã dừng')
        count=generate_rule(db,rule);audit(db,club.id,host.id,'Kiểm tra lịch lặp',f'{count} buổi mới');db.commit()
        return redirect(f'/schedule?club_id={club.id}')

    @app.get('/members')
    def members_page(request:Request,club_id:str|None=None,q:str='',kind:str='',gender:str='',db=Depends(db_session)):
        host=require_host(request,db);data=context(db,host,club_id);rows=data['members']
        if q:rows=[m for m in rows if q.casefold() in (m.name+' '+m.phone).casefold()]
        if kind:rows=[m for m in rows if m.kind==kind]
        if gender:rows=[m for m in rows if m.gender==gender]
        return page(request,'members.html',host=host,**data,rows=rows,q=q,kind=kind,gender=gender)

    @app.post('/workspace/members')
    async def workspace_member(request:Request,db=Depends(db_session)):
        from app.main import digits_phone,validated_gender,member_by_phone
        form=await request.form();ensure_csrf(request,form.get('csrf',''))
        try:club_id=int(form.get('club_id',0))
        except (TypeError,ValueError):raise HTTPException(400,'CLB không hợp lệ')
        host,club=owned_club(request,db,club_id);name=str(form.get('name','')).strip();kind=form.get('kind','fixed')
        if not name or len(name)>100 or kind not in ('fixed','guest'):raise HTTPException(400,'Thông tin thành viên chưa hợp lệ')
        phone=digits_phone(form.get('phone',''));gender=validated_gender(form.get('gender','unspecified'))
        if member_by_phone(db,club_id,phone):return redirect(f'/members?club_id={club_id}&message=phone_exists')
        db.add(Member(club_id=club_id,name=name,phone=phone,gender=gender,kind=kind,level=str(form.get('level',''))[:40]))
        audit(db,club_id,host.id,'Thêm thành viên',name);db.commit();return redirect(f'/members?club_id={club_id}')

    @app.get('/finance')
    def finance_page(request:Request,club_id:str|None=None,period:str='',status:str='',db=Depends(db_session)):
        host=require_host(request,db)
        data=context(db,host,club_id)
        if data['club_id']:owned_club(request,db,data['club_id'],permission='finance')
        allowed=[c.id for c in data['clubs'] if c.owner_id==host.id or db.scalar(select(ClubAccess.id).where(ClubAccess.club_id==c.id,ClubAccess.host_id==host.id,ClubAccess.role=='finance'))]
        rows=[r for r in ledger(db,data) if r['club_id'] in allowed]
        if period:rows=[r for r in rows if r['period']==period]
        summary=totals(rows)
        if status=='unpaid':rows=[r for r in rows if r['direction']=='income' and not r['paid'] and not r['cancelled']]
        elif status=='paid':rows=[r for r in rows if r['direction']=='income' and r['paid']]
        elif status=='expense':rows=[r for r in rows if r['direction']=='expense']
        finance_clubs=[c for c in data['clubs'] if c.id in allowed]
        return page(request,'finance.html',host=host,**data,finance_clubs=finance_clubs,rows=rows,financial=summary,period=period,status=status)

    @app.get('/finance/export.csv')
    def export_finance(request:Request,club_id:int,period:str='',db=Depends(db_session)):
        host,club=owned_club(request,db,club_id,permission='finance');data=context(db,host,club_id)
        rows=ledger(db,data);rows=[r for r in rows if not period or r['period']==period]
        buffer=io.StringIO();writer=csv.writer(buffer);writer.writerow(['Ngày/kỳ','Khoản','Chi tiết','Thu/chi','Số tiền','Trạng thái'])
        for row in rows:
            cells=[row['date'],row['title'],row['description'],'Chi' if row['direction']=='expense' else 'Thu',str(row['amount']),'Đã ghi nhận' if row['paid'] else 'Chưa thu']
            writer.writerow(["'"+v if v.startswith(('=','+','-','@')) else v for v in cells])
        return StreamingResponse(iter([buffer.getvalue().encode('utf-8-sig')]),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="sporthost-finance.csv"'})

    @app.post('/clubs/{club_id}/dues/bulk')
    def bulk_dues(request:Request,club_id:int,period:str=Form(),csrf:str=Form(),db=Depends(db_session)):
        import re
        ensure_csrf(request,csrf);host,club=owned_club(request,db,club_id,permission='finance')
        db.execute(select(Club).where(Club.id==club_id).with_for_update())
        if not re.fullmatch(r'20\d\d-(0[1-9]|1[0-2])',period):raise HTTPException(400,'Kỳ thu không hợp lệ')
        fixed=db.scalars(select(Member).where(Member.club_id==club_id,Member.kind=='fixed')).all();created=0
        for member in fixed:
            if db.scalar(select(MonthlyDue.id).where(MonthlyDue.member_id==member.id,MonthlyDue.period==period)):continue
            fee=getattr(club,'monthly_fee_'+member.gender,None) if member.gender in ('male','female') else None
            db.add(MonthlyDue(member_id=member.id,period=period,amount=fee if fee is not None else club.monthly_fee,qr_key=club.qr_key));created+=1
        audit(db,club_id,host.id,'Tạo phí tháng hàng loạt',f'{period}: {created} khoản');db.commit()
        return redirect(f'/finance?club_id={club_id}&period={period}')

    @app.get('/clubs/{club_id}/settings')
    def settings_page(request:Request,club_id:int,db=Depends(db_session)):
        host,club=owned_club(request,db,club_id)
        from app.payments import can_finance
        cohosts=db.execute(select(ClubAccess,Host).join(Host,Host.id==ClubAccess.host_id).where(ClubAccess.club_id==club_id)).all()
        logs=db.scalars(select(AuditLog).where(AuditLog.club_id==club_id).order_by(AuditLog.id.desc()).limit(50)).all()
        return page(request,'settings.html',host=host,club=club,cohosts=cohosts,logs=logs,owner=host.id==club.owner_id,can_finance_club=can_finance(db,host,club))

    @app.post('/clubs/{club_id}/cohosts')
    def add_cohost(request:Request,club_id:int,email:str=Form(),role:str=Form(),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);host,club=owned_club(request,db,club_id,permission='owner')
        if role not in ('manager','finance'):raise HTTPException(400,'Vai trò không hợp lệ')
        other=db.scalar(select(Host).where(Host.email==email.strip().lower()))
        if not other:raise HTTPException(400,'Người đồng quản lý cần đăng ký tài khoản SportHost trước')
        if other.id==club.owner_id:raise HTTPException(400,'Chủ CLB đã có toàn quyền')
        access=db.scalar(select(ClubAccess).where(ClubAccess.club_id==club_id,ClubAccess.host_id==other.id))
        if access:access.role=role
        else:db.add(ClubAccess(club_id=club_id,host_id=other.id,role=role))
        audit(db,club_id,host.id,'Cấp quyền đồng quản lý',f'{email}: {role}');db.commit()
        return redirect(f'/clubs/{club_id}/settings#access')

    @app.post('/clubs/{club_id}/cohosts/{access_id}/remove')
    def remove_cohost(request:Request,club_id:int,access_id:int,csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);host,club=owned_club(request,db,club_id,permission='owner');access=db.get(ClubAccess,access_id)
        if not access or access.club_id!=club_id:raise HTTPException(404)
        db.delete(access);audit(db,club_id,host.id,'Thu hồi quyền đồng quản lý');db.commit()
        return redirect(f'/clubs/{club_id}/settings#access')

    @app.post('/games/{game_id}/cancel')
    def cancel_game(request:Request,game_id:int,csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);game,club=owned_session(request,db,game_id,lock=True)
        game.is_cancelled=True;game.is_open=False
        for booking in db.scalars(select(Booking).where(Booking.session_id==game_id)):booking.status='cancelled'
        audit(db,club.id,require_host(request,db).id,'Hủy buổi đánh',game.title);db.commit()
        return redirect(f'/games/{game_id}')
