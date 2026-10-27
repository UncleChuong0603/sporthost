"""Grant/revoke platform administration for an existing account (operator CLI only).

ADMIN_EMAILS must explicitly allow the email before a grant. This does not mark an
email verified, create an account, or change its password.
"""
import argparse
import os
from sqlalchemy import select
from app.main import Host, AuditLog, SessionLocal


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['grant','revoke'])
    parser.add_argument('--email',required=True)
    args=parser.parse_args();email=args.email.strip().lower()
    allowed={v.strip().lower() for v in os.getenv('ADMIN_EMAILS','').split(',') if v.strip()}
    if args.action=='grant' and email not in allowed:
        raise SystemExit('Email must be explicitly listed in ADMIN_EMAILS')
    with SessionLocal.begin() as db:
        host=db.scalar(select(Host).where(Host.email==email).with_for_update())
        if not host:raise SystemExit('Account does not exist; sign up first')
        host.is_platform_admin=args.action=='grant'
        if args.action=='revoke':host.session_version+=1
        db.add(AuditLog(host_id=host.id,action='Operator '+args.action+' platform admin',details=email))
    print('Platform administration '+args.action+' completed for the specified existing account.')


if __name__=='__main__':main()
