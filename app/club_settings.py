"""Validate club settings before mutating ORM objects or writing an audit entry."""
import json

from fastapi import HTTPException
from app.sports import SPORTS

APPROVAL_MODES = {'MANUAL_APPROVE': 'Host duyệt đăng ký', 'AUTO_APPROVE': 'Tự động nhận khi còn chỗ'}
FEE_MODES = {'FIXED_PRICE': 'Giá cố định / người', 'COST_SHARING': 'Chia đều chi phí'}
CLUB_DEFAULTS = {
    'sport_type': 'badminton',
    'skill_guidance': '',
    'default_capacity': 20,
    'default_approval_mode': 'MANUAL_APPROVE',
    'cancellation_policy': '',
    'default_fee_mode': 'FIXED_PRICE',
    'venue_instructions': '',
}
SETTINGS_FIELDS = ('name', 'location', *CLUB_DEFAULTS)


def settings_snapshot(club):
    return {name: getattr(club, name) for name in SETTINGS_FIELDS}


def validate_settings(form, club=None):
    # Older forms can still rename a club without clearing newly added settings.
    values = settings_snapshot(club) if club else {'name': '', 'location': '', **CLUB_DEFAULTS}
    limits = {'name': 100, 'location': 180, 'skill_guidance': 500,
              'cancellation_policy': 2000, 'venue_instructions': 2000}
    labels = {'name': 'Tên CLB', 'location': 'Khu vực', 'skill_guidance': 'Hướng dẫn trình độ',
              'cancellation_policy': 'Chính sách hủy', 'venue_instructions': 'Hướng dẫn đến sân'}
    for field, limit in limits.items():
        if field in form:
            value = str(form[field]).strip()
            if len(value) > limit:
                raise HTTPException(400, f'{labels[field]} không được quá {limit} ký tự')
            values[field] = value
    if not values['name']:
        raise HTTPException(400, 'Vui lòng nhập tên CLB')
    for field, catalog, label in (
        ('sport_type', SPORTS, 'Môn thể thao'),
        ('default_approval_mode', APPROVAL_MODES, 'Cách duyệt đăng ký'),
        ('default_fee_mode', FEE_MODES, 'Cách thu phí'),
    ):
        if field in form:
            value = str(form[field]).strip()
            if value not in catalog:
                raise HTTPException(400, f'{label} không hợp lệ')
            values[field] = value
    if 'default_capacity' in form:
        try:
            capacity = int(str(form['default_capacity']))
        except (ValueError, TypeError):
            raise HTTPException(400, 'Giới hạn người phải là số nguyên từ 1 đến 200')
        if not 1 <= capacity <= 200:
            raise HTTPException(400, 'Giới hạn người phải từ 1 đến 200')
        values['default_capacity'] = capacity
    return values


def record_settings_audit(db, club, host_id, before):
    from app.models_extra import AuditLog
    # Do not truncate policy snapshots via the legacy 500-character audit helper.
    db.add(AuditLog(club_id=club.id, host_id=host_id,
                   action='Cập nhật cài đặt CLB' if before else 'Tạo CLB',
                   details=json.dumps({'before': before, 'after': settings_snapshot(club)}, ensure_ascii=False)))


def settings_audit_details(entry):
    """Keep the full machine-readable snapshot in DB; show hosts readable changes."""
    if entry.action not in ('Tạo CLB', 'Cập nhật cài đặt CLB'):
        return entry.details
    try:
        payload = json.loads(entry.details)
        before, after = payload['before'] or {}, payload['after']
        if not isinstance(before, dict) or not isinstance(after, dict):
            return entry.details
    except (ValueError, KeyError, TypeError):
        return entry.details
    labels = {'name': 'Tên CLB', 'location': 'Khu vực', 'sport_type': 'Môn thể thao',
              'skill_guidance': 'Trình độ phù hợp', 'default_capacity': 'Giới hạn người',
              'default_approval_mode': 'Cách duyệt đăng ký', 'default_fee_mode': 'Cách thu phí',
              'cancellation_policy': 'Chính sách hủy', 'venue_instructions': 'Hướng dẫn đến sân'}

    def display(field, value):
        if value is None or value == '':
            return 'Chưa cài đặt'
        if field == 'sport_type':
            return SPORTS.get(value, {'label': 'Thể thao'})['label']
        if field == 'default_approval_mode':
            return APPROVAL_MODES.get(value, str(value))
        if field == 'default_fee_mode':
            return FEE_MODES.get(value, str(value))
        return str(value)

    changes = []
    for field in SETTINGS_FIELDS:
        if field not in after or before.get(field) == after[field]:
            continue
        new = display(field, after[field])
        changes.append(f'{labels[field]}: {display(field, before.get(field))} → {new}' if before
                       else f'{labels[field]}: {new}')
    return '\n'.join(changes) or 'Cài đặt không thay đổi.'
