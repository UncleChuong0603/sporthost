"""Exercise required confirmation and cancel/confirm on desktop and mobile."""
import os
import re
import secrets

import pytest

pytestmark = pytest.mark.skipif(os.getenv('SPORTHOST_BROWSER_TESTS') != '1',
                                reason='Set SPORTHOST_BROWSER_TESTS=1 for local Playwright checks')


@pytest.mark.parametrize('width,height', [(375, 812), (812, 375), (1440, 1000)])
def test_delete_club_confirmation(browser_server, width, height):
    from playwright.sync_api import sync_playwright, expect

    with sync_playwright() as pw:
        executable = os.getenv('SPORTHOST_BROWSER_EXECUTABLE')
        options = {'executable_path': executable} if executable else {'channel': 'msedge'}
        browser = pw.chromium.launch(headless=True, **options)
        page = browser.new_page(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(browser_server + '/signup')
            page.get_by_label('Email', exact=True).fill(f'delete-browser-{secrets.token_hex(8)}@example.com')
            page.get_by_label('Mật khẩu', exact=True).fill('browser-deletion-password')
            page.get_by_role('button', name='Tạo tài khoản miễn phí', exact=True).click()
            page.wait_for_url('**/dashboard')
            page.goto(browser_server + '/clubs?create=1')
            form = page.locator('form[action="/clubs"]')
            club_name = 'CLB xóa thử & "xác nhận"'
            form.get_by_label('Tên CLB', exact=True).fill(club_name)
            form.get_by_role('button', name='Tạo CLB', exact=True).click()
            page.wait_for_url(re.compile(r'.*/clubs/\d+$'))
            club_path = page.url.removeprefix(browser_server)
            page.get_by_role('link', name='Cài đặt CLB', exact=True).click()
            page.get_by_role('link', name='Xóa CLB', exact=True).click()
            delete_form = page.locator(f'form[action="{club_path}/delete"]')
            confirm_name = delete_form.get_by_label('Nhập tên CLB để xác nhận xóa')
            button = delete_form.get_by_role('button', name='Xóa vĩnh viễn CLB', exact=True)
            button.click()
            assert not confirm_name.evaluate('(input) => input.validity.valid')
            confirm_name.fill(club_name)
            dialogs = []

            def cancel(dialog):
                dialogs.append(dialog.message)
                dialog.dismiss()

            page.once('dialog', cancel)
            button.click()
            assert dialogs and club_name in dialogs[0]
            expect(delete_form).to_be_visible()
            assert page.url.endswith('/settings#delete')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert button.bounding_box()['height'] >= 44
            page.once('dialog', lambda dialog: dialog.accept())
            button.click()
            page.wait_for_url('**/clubs?deleted=1')
            expect(page.get_by_role('status')).to_have_text('Đã xóa CLB và dữ liệu liên quan.')
            expect(page.locator('.club-nav-link')).to_have_count(0)
            expect(page.locator('.club-card')).to_have_count(0)
            assert not errors
        finally:
            browser.close()
