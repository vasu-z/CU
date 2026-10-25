from fastapi import APIRouter
from app.api.routes import health, ai

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(ai.router, prefix="/ai", tags=["AI"])

__all__ = ["api_router"]
