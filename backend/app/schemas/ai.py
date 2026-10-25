from typing import Optional
from pydantic import BaseModel, Field

DEFAULT_VISION_PROMPT = (
    "Describe what is visibly in front of the camera in 1 to 3 natural spoken sentences. "
    "Prioritize the main object directly in view, its appearance, nearby items, and any immediate obstacles. "
    "Read any legible text, labels, or signs. State clearly what is certain versus uncertain, and do not invent details without clear visual evidence."
)

SUPPORTED_MIME_TYPES = {"image/jpeg", "image/png", "image/jpg"}
MAX_DECODED_IMAGE_SIZE_BYTES = 8 * 1024 * 1024  # 8 MB


class AIStatusResponse(BaseModel):
    """Schema for reporting AI configuration status without exposing credentials."""

    configured: bool
    model: str


class AITestRequest(BaseModel):
    """Schema for triggering a minimal Gemini text generation test."""

    prompt: str = Field(
        default="Say hello in 5 words or less.",
        description="Text prompt to send to Gemini for connectivity verification.",
        max_length=500,
    )


class AITestResponse(BaseModel):
    """Schema for Gemini text generation test response."""

    status: str
    model: str
    prompt: str
    response: str


class AIVisionRequest(BaseModel):
    """Schema for multimodal image analysis request."""

    image_base64: str = Field(
        ...,
        description="Base64-encoded JPEG or PNG image data (with or without data URI prefix).",
    )
    prompt: Optional[str] = Field(
        default=None,
        description="Optional custom query. If omitted, uses default accessible guidance prompt.",
        max_length=2000,
    )
    mime_type: Optional[str] = Field(
        default="image/jpeg",
        description="MIME type of the image. Must be image/jpeg or image/png.",
    )


class AIVisionResponse(BaseModel):
    """Schema for multimodal image analysis response (excludes raw image data)."""

    status: str
    model: str
    prompt: str
    description: str
