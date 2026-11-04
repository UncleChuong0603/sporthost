"""The production smoke helper stays GET-only and confines Host overrides to tunnels."""
import sys

import httpx
import pytest

from scripts import dokploy_smoke


def test_smoke_uses_only_get_through_loopback_host_route(monkeypatch):
    calls=[]
    def handle(request):
        calls.append(request)
        assert request.method == 'GET'
        assert request.headers['host'] == 'preview.example.test'
        path=request.url.path
        if path == '/dokploy-smoke-nonexistent':return httpx.Response(404)
        if path == '/admin':return httpx.Response(401)
        if path == '/forgot-password':return httpx.Response(503)
        if path == '/static/style.css':return httpx.Response(200,text='body{}',headers={'content-type':'text/css'})
        return httpx.Response(200,json={'ok':True},headers={'x-content-type-options':'nosniff'})
    original=httpx.Client
    monkeypatch.setattr(dokploy_smoke.httpx,'Client',lambda **kwargs:original(transport=httpx.MockTransport(handle),**kwargs))
    monkeypatch.setattr(sys,'argv',['smoke','http://127.0.0.1:38080','--allow-http-loopback',
                                  '--host-header','preview.example.test','--expect-email-disabled'])
    with pytest.raises(SystemExit) as exc:dokploy_smoke.main()
    assert exc.value.code == 0
    assert len(calls) == 9


def test_smoke_refuses_host_override_on_public_origin(monkeypatch):
    monkeypatch.setattr(sys,'argv',['smoke','https://example.test','--allow-http-loopback',
                                  '--host-header','preview.example.test'])
    with pytest.raises(SystemExit) as exc:dokploy_smoke.main()
    assert exc.value.code == 2
