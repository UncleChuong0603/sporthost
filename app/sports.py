"""Extensible display catalog; persisted sport codes are never translated.

Add sports here without changing financial categories or introducing DB enums.
Existing clubs are badminton clubs according to the pre-migration README.
"""
SPORTS = {
    'badminton': {'label': 'Cầu lông', 'equipment_label': 'Tiền cầu'},
    'pickleball': {'label': 'Pickleball', 'equipment_label': 'Chi phí dụng cụ / khác'},
    'tennis': {'label': 'Quần vợt', 'equipment_label': 'Chi phí dụng cụ / khác'},
    'football': {'label': 'Bóng đá', 'equipment_label': 'Chi phí dụng cụ / khác'},
    'volleyball': {'label': 'Bóng chuyền', 'equipment_label': 'Chi phí dụng cụ / khác'},
    'basketball': {'label': 'Bóng rổ', 'equipment_label': 'Chi phí dụng cụ / khác'},
    'table_tennis': {'label': 'Bóng bàn', 'equipment_label': 'Chi phí dụng cụ / khác'},
}


def sport_label(code):
    return SPORTS.get(code, {'label': 'Thể thao'})['label']


def equipment_label(code):
    return SPORTS.get(code, {'equipment_label': 'Chi phí dụng cụ / khác'})['equipment_label']
