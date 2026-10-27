"""Account security, one-use email tokens and free beta administration."""
import hashlib
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

from fastapi import Depends, Form, HTTPException, Request
from sqlalchemy import select

from app.main import (app, Host, Club, EmailToken, AuditLog, db_session, require_host, ensure_csrf,
    page, redirect, hashed_password, check_password, signer, COOKIE_SECURE, SETTINGS)


def delivery_ready():
    return bool(os.getenv('SMTP_HOST') and os.getenv('MAIL_FROM'))


def send_account_mail(recipient,subject,content):
    if not delivery_ready():
        if SETTINGS['env'] in ('test','development'):
            outbox=Path('.vercel/mail-outbox');outbox.mkdir(parents=True,exist_ok=True)
            (outbox/(secrets.token_hex(12)+'.txt')).write_text(subject+'\n'+recipient+'\n'+content,encoding='utf-8')
            return
        raise HTTPException(503,'Email đang được cấu hình. Bạn vẫn có thể đổi mật khẩu trong tài khoản đã đăng nhập.')
    message=EmailMessage();message['From']=os.environ['MAIL_FROM'];message['To']=recipient;message['Subject']=subject
    message.set_content(content)
    host=os.environ['SMTP_HOST'];port=int(os.getenv('SMTP_PORT','587'))
    factory=smtplib.SMTP_SSL if port==465 else smtplib.SMTP
    with factory(host,port,timeout=15) as smtp:
        if port!=465:smtp.starttls()
        if os.getenv('SMTP_USER'):smtp.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD'])
        smtp.send_message(message)


def new_token(db,host,purpose):
    for old in db.scalars(select(EmailToken).where(EmailToken.host_id==host.id,EmailToken.purpose==purpose,EmailToken.used==False)):
        old.used=True
    raw=secrets.token_urlsafe(36)
    db.add(EmailToken(host_id=host.id,purpose=purpose,digest=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=(datetime.now(timezone.utc)+timedelta(minutes=30)).isoformat()))
    return raw


def valid_token(db,raw,purpose,lock=False):
    query=select(EmailToken).where(EmailToken.digest==hashlib.sha256(raw.encode()).hexdigest(),EmailToken.purpose==purpose)
    if lock:query=query.with_for_update()
    token=db.scalar(query)
    if not token or token.used or datetime.fromisoformat(token.expires_at)<datetime.now(timezone.utc):
        raise HTTPException(400,'Liên kết đã hết hạn hoặc đã dùng. Vui lòng yêu cầu liên kết mới.')
    return token


def account_cookie(response,host):
    response.set_cookie('clubhost',signer.dumps({'id':host.id,'v':host.session_version}),httponly=True,
        secure=COOKIE_SECURE,samesite='lax',max_age=60*60*24*14)


def admin_host(request,db):
    host=require_host(request,db)
    if not host.is_platform_admin:raise HTTPException(403)
    return host


def register_routes():
    @app.get('/account')
    def account(request:Request,db=Depends(db_session)):
        host=require_host(request,db)
        return page(request,'account.html',host=host,mail_ready=delivery_ready())

    @app.post('/account/password')
    def password(request:Request,current_password:str=Form(),password:str=Form(),confirm_password:str=Form(),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);host=require_host(request,db)
        if not check_password(current_password,host.password_hash):raise HTTPException(400,'Mật khẩu hiện tại không đúng')
        if len(password)<10 or len(password)>256 or password!=confirm_password:raise HTTPException(400,'Mật khẩu mới cần 10–256 ký tự và khớp phần xác nhận')
        host.password_hash=hashed_password(password);host.session_version+=1
        db.add(AuditLog(host_id=host.id,action='Đổi mật khẩu',details='Đã thu hồi các phiên đăng nhập cũ'))
        db.commit();response=redirect('/account?message=password');account_cookie(response,host);return response

    @app.post('/account/verify-email')
    def send_verification(request:Request,csrf:str=Form(),db=Depends(db_session)):
        from app.security import rate_limit
        rate_limit(request,'verify-email',limit=5,seconds=3600)
        ensure_csrf(request,csrf);host=require_host(request,db)
        if host.email_verified:return redirect('/account')
        raw=new_token(db,host,'verify');base=os.getenv('PUBLIC_BASE_URL','https://sporthost.vercel.app').rstrip('/')
        send_account_mail(host.email,'Xác minh tài khoản SportHost',f'Xác minh email của bạn (hết hạn sau 30 phút):\n{base}/verify-email?token={raw}')
        db.commit();return redirect('/account?message=verification-sent')

    @app.get('/verify-email')
    def verification_page(request:Request,token:str='',db=Depends(db_session)):
        valid_token(db,token,'verify')
        response=page(request,'email_action.html',mode='verify',token=token,sent=False)
        response.headers['Referrer-Policy']='no-referrer';response.headers['Cache-Control']='no-store'
        return response

    @app.post('/verify-email')
    def verification(request:Request,token:str=Form(),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);entry=valid_token(db,token,'verify',True);host=db.get(Host,entry.host_id)
        host.email_verified=True;entry.used=True
        admins={value.strip().lower() for value in os.getenv('ADMIN_EMAILS','').split(',') if value.strip()}
        if host.email in admins:host.is_platform_admin=True
        db.commit();return redirect('/login?message=verified')

    @app.get('/forgot-password')
    def forgot(request:Request):return page(request,'email_action.html',mode='forgot',sent=False)

    @app.post('/forgot-password')
    def request_reset(request:Request,email:str=Form(),csrf:str=Form(),db=Depends(db_session)):
        from app.security import rate_limit
        rate_limit(request,'password-reset',limit=5,seconds=3600)
        ensure_csrf(request,csrf)
        if not delivery_ready() and SETTINGS['env'] not in ('test','development'):
            raise HTTPException(503,'Email khôi phục đang được cấu hình; liên hệ quản trị để được hỗ trợ')
        host=db.scalar(select(Host).where(Host.email==email.strip().lower()))
        if host:
            raw=new_token(db,host,'reset');base=os.getenv('PUBLIC_BASE_URL','https://sporthost.vercel.app').rstrip('/')
            send_account_mail(host.email,'Đặt lại mật khẩu SportHost',f'Đặt lại mật khẩu của bạn (hết hạn sau 30 phút):\n{base}/reset-password?token={raw}')
            db.commit()
        return page(request,'email_action.html',mode='forgot',sent=True)

    @app.get('/reset-password')
    def reset_page(request:Request,token:str='',db=Depends(db_session)):
        valid_token(db,token,'reset');response=page(request,'email_action.html',mode='reset',token=token,sent=False)
        response.headers['Referrer-Policy']='no-referrer';response.headers['Cache-Control']='no-store';return response

    @app.post('/reset-password')
    def reset_password(request:Request,token:str=Form(),password:str=Form(),confirm_password:str=Form(),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);entry=valid_token(db,token,'reset',True)
        if len(password)<10 or len(password)>256 or password!=confirm_password:raise HTTPException(400,'Mật khẩu mới cần 10–256 ký tự và khớp phần xác nhận')
        host=db.get(Host,entry.host_id);host.password_hash=hashed_password(password);host.session_version+=1;entry.used=True
        db.commit();response=redirect('/login?message=reset');response.delete_cookie('clubhost');return response

    @app.get('/admin')
    def admin(request:Request,db=Depends(db_session)):
        host=admin_host(request,db)
        clubs=db.scalars(select(Club).order_by(Club.id.desc())).all()
        hosts=db.scalars(select(Host).order_by(Host.id.desc())).all()
        logs=db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(60)).all()
        return page(request,'admin.html',host=host,all_clubs=clubs,all_hosts=hosts,logs=logs)

    @app.post('/admin/clubs/{club_id}/trial')
    def extend_trial(request:Request,club_id:int,days:int=Form(30),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);host=admin_host(request,db);club=db.get(Club,club_id)
        if not club:raise HTTPException(404)
        if not 1<=days<=365:raise HTTPException(400)
        club.trial_ends_at=(datetime.now(timezone.utc)+timedelta(days=days)).isoformat()
        db.add(AuditLog(club_id=club_id,host_id=host.id,action='Gia hạn Pro trial miễn phí',details=f'{days} ngày'))
        db.commit();return redirect('/admin')
