"""Vercel FastAPI entrypoint. Database migrations run separately."""
from app.main import app

__all__ = ['app']
