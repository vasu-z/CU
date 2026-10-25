from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    """Schema for service health check response."""

    status: str
    service: str
    version: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "ok",
                "service": "saarthi-backend",
                "version": "0.1.0",
            }
        }
    )
