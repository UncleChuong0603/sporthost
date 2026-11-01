import os
from pathlib import Path

import pytest

from test_group_bookings import context, game, booking, post

pytestmark = pytest.mark.skipif(os.getenv('SPORTHOST_BROWSER_TESTS') != '1', reason='Local browser checks are opt-in')


def test_mobile_facebook_guest_group_and_private_link(context, browser_server):
    from playwright.sync_api import sync_playwright, expect
    host, guest_api, club = context
    game_id, public = game(context, capacity=3)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='msedge', headless=True)
        browser_context = browser.new_context(viewport={'width': 375, 'height': 812})
        page = browser_context.new_page()
        try:
            page.goto(browser_server + public + '?source=facebook')
            page.get_by_label('Số điện thoại', exact=True).fill('0902345678')
            page.get_by_role('button', name='Tiếp tục', exact=True).click()
            page.get_by_label('Họ tên', exact=True).fill('Khách Facebook')
            page.get_by_text('Đăng ký hộ người đi cùng (tùy chọn)', exact=True).click()
            companions = page.locator('[name="companion_name"]')
            companions.nth(0).fill('Bạn thứ hai'); companions.nth(1).fill('Bạn thứ ba')
            expect(page.locator('[data-party-count]')).to_contain_text('3 người')
            page.get_by_role('button', name='Xác nhận gửi yêu cầu', exact=True).click()
            expect(page.get_by_text('Đã nhận đăng ký.', exact=False)).to_be_visible()
            page.get_by_role('link', name='Xem đăng ký & thanh toán của tôi', exact=True).click()
            expect(page.locator('.guest-registration')).to_contain_text('3 người')
            expect(page.locator('.guest-registration')).to_contain_text('Bạn thứ ba')
            private_url = page.url
            assert '/attend/' in private_url
            saved = booking(game_id)
            assert saved.channel == 'facebook_link'
            post(host, f'/games/{game_id}/bookings/{saved.id}/approve', {}, f'/games/{game_id}')
            page.get_by_role('link', name='Cập nhật trạng thái', exact=True).click()
            expect(page.locator('.guest-registration')).to_contain_text('Đã xác nhận chỗ')
            expect(page.locator('.guest-registration')).to_contain_text('210.000đ')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            artifact = Path('.vercel/test-artifacts/group-booking-mobile.png')
            artifact.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(artifact), full_page=True)
            assert page.request.get(private_url).headers['referrer-policy'] == 'no-referrer'
            page.once('dialog', lambda dialog: dialog.accept())
            page.get_by_role('button', name='Hủy tham gia', exact=True).click()
            expect(page.locator('.guest-registration')).to_contain_text('Đã hủy')
        finally:
            browser_context.close(); browser.close()
