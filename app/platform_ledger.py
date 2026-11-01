"""The SaaS operator's own ledger. No club balance or QR is used here."""
import secrets
import os
from datetime import datetime,timezone
from fastapi import Request,Depends,Form,HTTPException
from sqlalchemy import select
from app.main import app,db_session,page,redirect,ensure_csrf,PlatformLedgerEntry,money
from app.accounts import admin_host
from app.attendance import log_change


def entry_values(entry_date,direction,category,amount,note):
    try:day=datetime.strptime(entry_date,'%Y-%m-%d').strftime('%Y-%m-%d')
    except ValueError:raise HTTPException(400,'Ngày thu chi không hợp lệ')
    if direction not in ('INCOME','EXPENSE') or not category.strip() or len(category)>80 or len(note)>1000:
        raise HTTPException(400,'Nội dung thu chi không hợp lệ')
    amount=money(amount)
    if not amount:raise HTTPException(400,'Số tiền phải lớn hơn 0')
    return dict(entry_date=day,direction=direction,category=category.strip(),amount=amount,note=note.strip())


def snapshot(entry):
    return {name:getattr(entry,name) for name in ('id','entry_date','direction','category','amount','note','version')}


def register_routes():
    @app.get('/admin/platform-ledger')
    def ledger_page(request:Request,period:str='',db=Depends(db_session)):
        host=admin_host(request,db)
        if period:
            try:datetime.strptime(period,'%Y-%m')
            except ValueError:raise HTTPException(400,'Tháng không hợp lệ')
        query=select(PlatformLedgerEntry)
        if period:query=query.where(PlatformLedgerEntry.entry_date.startswith(period+'-'))
        entries=db.scalars(query.order_by(PlatformLedgerEntry.entry_date.desc(),PlatformLedgerEntry.id.desc())).all()
        received=sum(e.amount for e in entries if e.direction=='INCOME');expenses=sum(e.amount for e in entries if e.direction=='EXPENSE')
        from app.main import AuditLog
        logs=db.scalars(select(AuditLog).where(AuditLog.club_id.is_(None),AuditLog.action.in_(
            ['Ghi sổ nền tảng','Sửa sổ nền tảng'])).order_by(AuditLog.id.desc()).limit(100)).all()
        return page(request,'platform_ledger.html',host=host,entries=entries,period=period,received=received,
                    expenses=expenses,logs=logs,request_key=secrets.token_urlsafe(24),
                    trial_days=int(os.getenv('PLATFORM_TRIAL_DAYS','30')),
                    monthly_price=int(os.getenv('PLATFORM_CLUB_MONTHLY_VND','99000')))

    @app.post('/admin/platform-ledger')
    def create(request:Request,entry_date:str=Form(),direction:str=Form(),category:str=Form(),
               amount:int=Form(),note:str=Form(''),request_key:str=Form(),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);host=admin_host(request,db)
        # Serialize duplicate requests for the same administrator without touching any club.
        from app.main import Host
        db.scalar(select(Host).where(Host.id==host.id).with_for_update())
        values=entry_values(entry_date,direction,category,amount,note)
        if not 8<=len(request_key)<=128:raise HTTPException(400,'Mã thao tác không hợp lệ')
        old=db.scalar(select(PlatformLedgerEntry).where(PlatformLedgerEntry.request_key==request_key))
        if old:
            if any(getattr(old,k)!=v for k,v in values.items()):raise HTTPException(409,'Mã thao tác đã được dùng')
            return redirect('/admin/platform-ledger')
        entry=PlatformLedgerEntry(**values,created_by=host.id,request_key=request_key)
        db.add(entry);db.flush();log_change(db,None,host.id,'Ghi sổ nền tảng',None,snapshot(entry))
        db.commit();return redirect('/admin/platform-ledger')

    @app.post('/admin/platform-ledger/{entry_id}/edit')
    def edit(request:Request,entry_id:int,entry_date:str=Form(),direction:str=Form(),category:str=Form(),
             amount:int=Form(),note:str=Form(''),reason:str=Form(),version:int=Form(),csrf:str=Form(),db=Depends(db_session)):
        ensure_csrf(request,csrf);host=admin_host(request,db)
        entry=db.scalar(select(PlatformLedgerEntry).where(PlatformLedgerEntry.id==entry_id).with_for_update())
        if not entry:raise HTTPException(404)
        if entry.version!=version:raise HTTPException(409,'Khoản đã được sửa. Vui lòng tải lại trang')
        if not reason.strip() or len(reason)>500:raise HTTPException(400,'Cần lý do sửa hợp lệ')
        values=entry_values(entry_date,direction,category,amount,note);before=snapshot(entry)
        for name,value in values.items():setattr(entry,name,value)
        entry.version+=1;entry.updated_by=host.id;entry.updated_at=datetime.now(timezone.utc).isoformat()
        log_change(db,None,host.id,'Sửa sổ nền tảng',before,snapshot(entry),reason.strip())
        db.commit();return redirect('/admin/platform-ledger')
