from fastapi import APIRouter
from app.core.config import get_settings
from app.schemas.health import HealthResponse

router = APIRouter()
settings = get_settings()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Check whether the backend service is running and healthy.",
    tags=["Health"],
)
def get_health() -> HealthResponse:
    """Return status, service name, and version without external service dependencies."""
    return HealthResponse(
        status="ok",
        service="saarthi-backend",
        version=settings.VERSION,
    )
