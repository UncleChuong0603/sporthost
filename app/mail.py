"""Account email adapter. No recipient, token, content or provider body in logs."""
import hashlib
import logging
import os
import secrets
import smtplib
import time
from email.message import EmailMessage
from pathlib import Path

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)
UNAVAILABLE = 'Email đang được cấu hình hoặc tạm thời không khả dụng. Vui lòng thử lại sau.'


def provider():
    return os.getenv('EMAIL_PROVIDER', 'smtp' if os.getenv('SMTP_HOST') else 'resend').lower()


def sender():
    return os.getenv('EMAIL_FROM') or os.getenv('MAIL_FROM', '')


def delivery_ready():
    # Existing SMTP remains compatible when no switch was configured. Resend is opt-in.
    enabled = os.getenv('EMAIL_ENABLED', 'true' if provider() == 'smtp' else 'false').lower() == 'true'
    if not enabled or not sender():
        return False
    return bool(os.getenv('RESEND_API_KEY')) if provider() == 'resend' else (
        provider() == 'smtp' and bool(os.getenv('SMTP_HOST')))


def send_account_mail(recipient, subject, content, *, environment):
    if not delivery_ready():
        if environment in ('test', 'development') and 'EMAIL_ENABLED' not in os.environ:
            outbox = Path('.vercel/mail-outbox')
            outbox.mkdir(parents=True, exist_ok=True)
            (outbox / (secrets.token_hex(12) + '.txt')).write_text(subject+'\n'+recipient+'\n'+content, encoding='utf-8')
            return 'local-outbox'
        raise HTTPException(503, UNAVAILABLE)
    if provider() == 'resend':
        return send_resend(recipient, subject, content)
    try:
        message = EmailMessage()
        message['From'], message['To'], message['Subject'] = sender(), recipient, subject
        message.set_content(content)
        port = int(os.getenv('SMTP_PORT', '587'))
        factory = smtplib.SMTP_SSL if port == 465 else smtplib.SMTP
        with factory(os.environ['SMTP_HOST'], port, timeout=10) as smtp:
            if port != 465:
                smtp.starttls()
            if os.getenv('SMTP_USER'):
                smtp.login(os.environ['SMTP_USER'], os.environ['SMTP_PASSWORD'])
            smtp.send_message(message)
        return 'smtp-accepted'
    except (smtplib.SMTPException, OSError, ValueError, KeyError):
        logger.warning('Account email delivery failed (SMTP)')
        raise HTTPException(503, UNAVAILABLE) from None


def send_resend(recipient, subject, content):
    payload = {'from': sender(), 'to': [recipient], 'subject': subject, 'text': content}
    # Exact same message uses the same key for all bounded retries (24h at Resend).
    import json
    key = 'account-' + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    headers = {'Authorization': 'Bearer ' + os.environ['RESEND_API_KEY'], 'Idempotency-Key': key}
    with httpx.Client(timeout=5, follow_redirects=False) as client:
        for attempt in range(3):
            try:
                response = client.post('https://api.resend.com/emails', headers=headers, json=payload)
                if response.is_success:
                    if response.json().get('id'):
                        return 'resend-accepted'
                    break
                if response.status_code != 429 and response.status_code < 500:
                    break
                delay = float(response.headers.get('Retry-After', 0.25 * (2 ** attempt)))
                # Do not retry before a provider's requested delay or hold a web worker indefinitely.
                if delay > 2:
                    break
            except httpx.TransportError:
                delay = 0.25 * (2 ** attempt)
            except (ValueError, AttributeError):
                break
            if attempt < 2:
                time.sleep(max(0, delay))
    logger.warning('Account email delivery failed (Resend)')
    raise HTTPException(503, UNAVAILABLE)
