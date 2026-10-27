"""Database-backed rate limiting shared by serverless instances."""
import hashlib
import hmac
import time

from fastapi import HTTPException
from sqlalchemy import Integer,String,delete
from sqlalchemy.orm import Mapped,mapped_column
from app.main import Base,SessionLocal,SECRET_KEY


class RequestLimit(Base):
    __tablename__='request_limits'
    id:Mapped[str]=mapped_column(String(80),primary_key=True)
    bucket:Mapped[int]=mapped_column(Integer)
    hits:Mapped[int]=mapped_column(Integer)


def rate_limit(request,scope,limit=30,seconds=60):
    # Vercel sets this header at its trusted edge; local deployments use the socket IP.
    import os
    ip=request.headers.get('x-forwarded-for','').split(',')[0].strip() if os.getenv('VERCEL')=='1' else ''
    ip=ip or (request.client.host if request.client else 'unknown')
    digest=hmac.new(SECRET_KEY.encode(),(scope+'|'+ip).encode(),hashlib.sha256).hexdigest()
    bucket=int(time.time())//seconds;key=digest+':'+str(bucket)
    with SessionLocal.begin() as db:
        if db.bind.dialect.name=='postgresql':
            from sqlalchemy.dialects.postgresql import insert
        else:
            from sqlalchemy.dialects.sqlite import insert
        stmt=insert(RequestLimit).values(id=key,bucket=int(time.time())+seconds,hits=1)
        hits=db.scalar(stmt.on_conflict_do_update(index_elements=['id'],set_={'hits':RequestLimit.hits+1}).returning(RequestLimit.hits))
        if int(time.time())%30==0:db.execute(delete(RequestLimit).where(RequestLimit.bucket<int(time.time())-3600))
    if hits>limit:raise HTTPException(429,'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.',headers={'Retry-After':str(seconds),'Cache-Control':'no-store'})
