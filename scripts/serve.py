"""Production ASGI entrypoint; migrations never run here."""
import os
import uvicorn


def main():
    uvicorn.run('app.main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8000')),
                workers=1, proxy_headers=True,
                forwarded_allow_ips=os.getenv('FORWARDED_ALLOW_IPS', '127.0.0.1'),
                # Access logs contain guest capability and reset tokens in URLs.
                access_log=False, server_header=False)


if __name__ == '__main__':
    main()
