from typing import List, Optional
from pydantic import BaseModel, Field


class TimetableItem(BaseModel):
    """Structured extraction of a class or lecture schedule item."""
    course_code: str = Field(..., description="e.g. CS201 or MATH101")
    course_name: str = Field(..., description="e.g. Data Structures")
    day_of_week: str = Field(..., description="Monday, Tuesday, etc.")
    start_time: str = Field(..., description="24-hour time HH:mm or 12-hour e.g. 09:30")
    end_time: str = Field(..., description="24-hour time HH:mm or 12-hour e.g. 11:00")
    room: str = Field(..., description="Room or hall identifier e.g. Room 204")
    building: Optional[str] = Field(default=None, description="Building name if visible")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class DoorSignInfo(BaseModel):
    """Structured extraction of a room door plaque or office sign."""
    room_number: str = Field(..., description="e.g. 204, 301-B, Lab 4")
    department: Optional[str] = Field(default=None, description="Department or faculty name")
    occupants: List[str] = Field(default_factory=list, description="Professors or staff listed")
    status: Optional[str] = Field(default=None, description="e.g. In Session, Office Hours, Closed")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class NoticeItem(BaseModel):
    """Structured extraction of a campus notice, deadline, or announcement."""
    title: str = Field(..., description="Title or headline of the notice")
    raw_date_text: Optional[str] = Field(default=None, description="Verbatim date string on the poster (no LLM math)")
    summary: str = Field(..., description="Concise summary in 1-2 spoken sentences")
    urgency: str = Field(default="normal", description="urgent, normal, or informational")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class CampusReadingRequest(BaseModel):
    """Request payload for campus reading pipeline."""
    image_base64: Optional[str] = Field(default=None, description="Base64-encoded image")
    ocr_text: Optional[str] = Field(default=None, description="Pre-extracted on-device OCR text")
    reading_mode: str = Field(
        default="auto",
        description="Reading mode: 'auto', 'timetable', 'sign', 'notice', or 'surroundings'"
    )


class CampusReadingResponse(BaseModel):
    """Structured, validated campus reading response."""
    status: str
    reading_mode: str
    spoken_summary: str = Field(..., description="Natural spoken output for TTS")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    needs_rescan: bool = Field(default=False)
    source_text: str = Field(default="", description="Verbatim text extracted from image")
    door_sign: Optional[DoorSignInfo] = None
    timetable_items: List[TimetableItem] = Field(default_factory=list)
    notices: List[NoticeItem] = Field(default_factory=list)
    uncertainties: List[str] = Field(default_factory=list)
    unchecked_areas: List[str] = Field(default_factory=list)
