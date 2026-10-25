from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import api_router
from app.core.config import get_settings


def create_application() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    settings = get_settings()

    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
    )

    if settings.CORS_ORIGINS:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=settings.CORS_ORIGINS,
            allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Mount API v1 router
    application.include_router(api_router, prefix=settings.API_V1_STR)

    return application


app = create_application()
