"""Explicit co-host capabilities; legacy roles remain compatible."""
import json
from sqlalchemy import select

PERMISSIONS = {'manage_session':'Quản lý buổi đánh', 'manage_bookings':'Duyệt & quản lý người chơi',
               'check_in':'Điểm danh tại sân', 'manage_finance':'Quản lý thu chi & biên nhận',
               'edit_club_settings':'Sửa cài đặt CLB'}
LEGACY = {'manager':{'manage_session','manage_bookings','check_in'}, 'finance':{'manage_finance'}}


def capabilities(access):
    if access.permissions is None:return LEGACY.get(access.role,set())
    return set(json.loads(access.permissions)) & PERMISSIONS.keys()


def can(db, host, club, permission):
    from app.main import ClubAccess
    if club.owner_id==host.id:return True
    access=db.scalar(select(ClubAccess).where(ClubAccess.club_id==club.id,ClubAccess.host_id==host.id))
    if not access:return False
    if permission=='view':return True
    if permission=='owner':return False
    rights=capabilities(access)
    if permission=='contacts':return bool(rights & {'manage_bookings','manage_finance'})
    permission={'manage':'manage_session','finance':'manage_finance'}.get(permission,permission)
    return permission in rights
