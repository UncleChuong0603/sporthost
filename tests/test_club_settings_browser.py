"""Opt-in real-browser regression on a local server and disposable test data."""
import os
import re
import secrets
import socket
import threading
import time
from pathlib import Path

import pytest
import uvicorn

from app.main import app

pytestmark = pytest.mark.skipif(os.getenv('SPORTHOST_BROWSER_TESTS') != '1',
                                reason='Set SPORTHOST_BROWSER_TESTS=1 for local Playwright checks')


@pytest.fixture(scope='module')
def local_server():
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level='error', lifespan='off'))
    thread = threading.Thread(target=server.run, kwargs={'sockets': [sock]}, daemon=True)
    thread.start()
    try:
        for _ in range(100):
            if server.started:
                break
            if not thread.is_alive():
                pytest.fail('Local browser test server failed to start')
            time.sleep(0.05)
        assert server.started
        yield f'http://127.0.0.1:{port}'
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        sock.close()


@pytest.mark.parametrize('width,height', [(375, 812), (812, 375), (1440, 1000)])
def test_club_settings_mobile_and_desktop(local_server, width, height):
    from playwright.sync_api import sync_playwright, expect

    with sync_playwright() as pw:
        options = {'headless': True}
        executable = os.getenv('SPORTHOST_BROWSER_EXECUTABLE')
        if executable:
            options['executable_path'] = executable
        else:
            options['channel'] = 'msedge'
        browser = pw.chromium.launch(**options)
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(local_server + '/signup')
            page.get_by_label('Email', exact=True).fill(f'browser-{secrets.token_hex(8)}@example.com')
            page.get_by_label('Mật khẩu', exact=True).fill('browser-settings-password')
            page.get_by_role('button', name='Tạo tài khoản miễn phí', exact=True).click()
            page.wait_for_url('**/dashboard')
            page.goto(local_server + '/clubs?create=1')
            form = page.locator('form[action="/clubs"]')
            form.get_by_label('Tên CLB', exact=True).fill('CLB Kiểm thử mobile')
            form.get_by_label('Môn thể thao', exact=True).select_option('pickleball')
            form.get_by_label('Giới hạn người mặc định').fill('16')
            form.get_by_label('Trình độ phù hợp').fill('Người mới và trung bình')
            form.get_by_label('Chính sách hủy').fill('Báo hủy trước 6 giờ')
            form.get_by_label('Hướng dẫn đến sân').fill('Cổng số 2, gửi xe bên trái')
            form.get_by_role('button', name='Tạo CLB', exact=True).click()
            page.wait_for_url(re.compile(r'.*/clubs/\d+$'))
            club_path = page.url.removeprefix(local_server)
            expect(page.locator('main')).to_contain_text('Pickleball')
            page.goto(local_server + club_path + '/settings')
            expect(page.get_by_label('Môn thể thao', exact=True)).to_have_value('pickleball')
            expect(page.get_by_label('Giới hạn người mặc định')).to_have_value('16')
            page.get_by_label('Môn thể thao', exact=True).select_option('tennis')
            page.get_by_label('Giới hạn người mặc định').fill('12')
            page.get_by_role('button', name='Lưu cài đặt CLB', exact=True).click()
            expect(page.get_by_role('status')).to_contain_text('Đã lưu cài đặt CLB.')
            expect(page.get_by_label('Môn thể thao', exact=True)).to_have_value('tennis')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Settings page overflows viewport'
            assert page.get_by_label('Môn thể thao', exact=True).bounding_box()['height'] >= 44
            artifact_dir = Path('.vercel/test-artifacts')
            artifact_dir.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(artifact_dir / f'club-settings-{width}.png'), full_page=True)
            club_id = club_path.split('/')[-1]
            page.goto(local_server + f'/schedule?club_id={club_id}&create=1')
            game_form = page.locator('[data-game-create]')
            expect(game_form.locator('[name="capacity"]')).to_have_value('12')
            # Unmodified defaults follow the selected club; explicit input is kept.
            page.goto(local_server + '/clubs?create=1')
            new_form = page.locator('form[action="/clubs"]')
            new_form.get_by_label('Tên CLB', exact=True).fill('CLB thứ hai')
            new_form.get_by_label('Giới hạn người mặc định').fill('18')
            new_form.get_by_role('button', name='Tạo CLB', exact=True).click()
            page.wait_for_url(re.compile(r'.*/clubs/\d+$'))
            other_id = page.url.split('/')[-1]
            page.goto(local_server + f'/schedule?club_id={club_id}&create=1')
            game_form = page.locator('[data-game-create]')
            game_form.locator('[name="club_id"]').select_option(other_id)
            expect(game_form.locator('[name="capacity"]')).to_have_value('18')
            game_form.locator('[name="capacity"]').fill('14')
            game_form.locator('[name="club_id"]').select_option(club_id)
            expect(game_form.locator('[name="capacity"]')).to_have_value('14')
            assert not errors
        finally:
            context.close()
            browser.close()
