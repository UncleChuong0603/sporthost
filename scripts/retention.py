"""Remove rejected proof media older than the configured retention, preserving audit rows.

Defaults to read-only listing of counts. Use --apply to perform the reviewed cleanup.
Never removes current QR images, QR snapshots, pending proofs or confirmed proofs.
"""
import argparse
from datetime import datetime,timedelta,timezone
from sqlalchemy import select


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--days',type=int,default=90)
    parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    if args.days<30:raise SystemExit('Minimum retention is 30 days')
    from app.main import SessionLocal,PaymentProof,StoredAsset,AuditLog
    from app.storage import delete_image
    cutoff=(datetime.now(timezone.utc)-timedelta(days=args.days)).isoformat()
    with SessionLocal.begin() as db:
        proofs=db.scalars(select(PaymentProof).where(PaymentProof.status=='rejected',PaymentProof.created_at<cutoff)).all()
        count=0
        for proof in proofs:
            asset=db.get(StoredAsset,proof.asset_id)
            if asset.kind!='proof' or asset.size==0:continue
            count+=1
            if args.apply:
                delete_image(asset.key);asset.size=0
                db.add(AuditLog(club_id=asset.club_id,action='Hết hạn lưu biên nhận bị từ chối',details=f'Biên nhận #{proof.id}'))
        print(f'{count} rejected proof image(s) '+('removed; audit retained' if args.apply else 'eligible; no changes made'))


if __name__=='__main__':main()
