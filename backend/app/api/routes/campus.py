import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, status
from app.core.config import get_settings
from app.schemas.campus import (
    CampusReadingRequest,
    CampusReadingResponse,
    DoorSignInfo,
    NoticeItem,
    TimetableItem,
)
from app.services.gemini import GeminiServiceException, analyze_image, generate_text

logger = logging.getLogger(__name__)
router = APIRouter()


CAMPUS_READER_SYSTEM_PROMPT = """You are SAARTHI Campus Reader for blind university students.
Your job is to EXTRACT raw text from the image or OCR transcript and categorize it strictly into one of:
1. Timetable: schedule of classes with course codes, days, start/end times, and rooms.
2. Door Sign: classroom or office door sign with room number, department, occupants, status.
3. Notice: campus poster or notice board with title, raw verbatim date string (DO NOT DO DATE MATH), and summary.
4. General Surroundings: brief description of objects/doors in view.

MANDATORY SAFETY RULES:
- Never invent room numbers, times, courses, or deadlines.
- If text is unreadable or blurry, set confidence to 0.4 and needs_rescan to true.
- Output ONLY a valid JSON object matching the following structure:
{
  "reading_mode": "timetable" | "sign" | "notice" | "surroundings",
  "spoken_summary": "1 to 2 clear spoken sentences for text-to-speech",
  "confidence": float between 0.0 and 1.0,
  "needs_rescan": boolean,
  "source_text": "verbatim text visible",
  "door_sign": {"room_number": "...", "department": "...", "occupants": [], "status": "..."} or null,
  "timetable_items": [{"course_code": "...", "course_name": "...", "day_of_week": "...", "start_time": "...", "end_time": "...", "room": "..."}],
  "notices": [{"title": "...", "raw_date_text": "...", "summary": "...", "urgency": "normal"}],
  "uncertainties": ["..."],
  "unchecked_areas": ["Drop-offs and ground obstacles outside camera frame"]
}
"""


def _generate_mock_campus_response(request: CampusReadingRequest) -> CampusReadingResponse:
    """Generate a realistic mock campus reading response for local development and offline testing."""
    mode = request.reading_mode.lower()
    ocr = (request.ocr_text or "").lower()

    if mode == "timetable" or "timetable" in ocr or "schedule" in ocr:
        items = [
            TimetableItem(
                course_code="CS201",
                course_name="Data Structures & Algorithms",
                day_of_week="Monday",
                start_time="10:00",
                end_time="11:30",
                room="Room 204",
                building="Turing Hall",
                confidence=0.95,
            ),
            TimetableItem(
                course_code="MATH210",
                course_name="Linear Algebra",
                day_of_week="Monday",
                start_time="14:00",
                end_time="15:30",
                room="Hall B",
                building="Newton Center",
                confidence=0.92,
            ),
        ]
        return CampusReadingResponse(
            status="mock_success",
            reading_mode="timetable",
            spoken_summary="Timetable found. You have CS201 Data Structures on Monday at 10 AM in Room 204, and Linear Algebra at 2 PM in Hall B.",
            confidence=0.94,
            needs_rescan=False,
            source_text="CS201 Data Structures Mon 10:00-11:30 Room 204; MATH210 Mon 14:00-15:30 Hall B",
            timetable_items=items,
            uncertainties=[],
            unchecked_areas=["Ground drop-offs and peripheral surroundings"],
        )

    if mode == "notice" or "notice" in ocr or "deadline" in ocr or "assignment" in ocr:
        notices = [
            NoticeItem(
                title="CS201 Assignment 2 Submission Deadline",
                raw_date_text="Wednesday, October 28 at 5:00 PM",
                summary="Assignment 2 must be submitted online before 5 PM on Wednesday, October 28.",
                urgency="urgent",
                confidence=0.93,
            )
        ]
        return CampusReadingResponse(
            status="mock_success",
            reading_mode="notice",
            spoken_summary="Notice found: CS201 Assignment 2 deadline is Wednesday, October 28 at 5:00 PM.",
            confidence=0.93,
            needs_rescan=False,
            source_text="DEPARTMENT OF COMPUTER SCIENCE: Assignment 2 due Wednesday, October 28 at 5:00 PM.",
            notices=notices,
            uncertainties=[],
            unchecked_areas=["Drop-offs and ground obstacles"],
        )

    # Default to door sign
    door_sign = DoorSignInfo(
        room_number="Room 204",
        department="Department of Computer Science",
        occupants=["Dr. Alan Turing", "Prof. Ada Lovelace"],
        status="Faculty Office Hours 2 PM - 4 PM",
        confidence=0.96,
    )
    return CampusReadingResponse(
        status="mock_success",
        reading_mode="sign",
        spoken_summary="Door sign reads Room 204, Department of Computer Science. Dr. Alan Turing and Prof. Ada Lovelace. Office hours 2 to 4 PM.",
        confidence=0.96,
        needs_rescan=False,
        source_text="ROOM 204 | DEPARTMENT OF COMPUTER SCIENCE | Dr. Alan Turing, Prof. Ada Lovelace | Office Hours: 2-4 PM",
        door_sign=door_sign,
        uncertainties=[],
        unchecked_areas=["Drop-offs and obstacles below camera height"],
    )


@router.post(
    "/read",
    response_model=CampusReadingResponse,
    summary="Read and structure campus signage, notices, or timetables",
    description="Processes OCR text or images to extract structured campus information.",
)
def read_campus_text(request: CampusReadingRequest) -> CampusReadingResponse:
    """
    Analyzes campus documents, signs, timetables, or notices.
    Enforces Rule 2 (confidence thresholds) and Rule 4 (fail audible).
    """
    settings = get_settings()

    has_ocr = bool(request.ocr_text and request.ocr_text.strip())
    has_image = bool(request.image_base64 and request.image_base64.strip())

    if not has_ocr and not has_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either ocr_text or image_base64 must be provided.",
        )

    # Fail audible if input text is completely unreadable / noisy
    if has_ocr and len(request.ocr_text.strip()) < 4 and not has_image:
        return CampusReadingResponse(
            status="low_confidence",
            reading_mode=request.reading_mode,
            spoken_summary="I couldn't read that clearly, please try again.",
            confidence=0.3,
            needs_rescan=True,
            source_text=request.ocr_text.strip() if request.ocr_text else "",
            uncertainties=["Text contains fewer than 4 readable characters."],
            unchecked_areas=["All surrounding areas"],
        )

    # If backend Gemini is unconfigured and mock mode is active, return deterministic mock data
    if not settings.is_gemini_configured:
        if settings.ENABLE_AI_MOCK:
            return _generate_mock_campus_response(request)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env.",
        )

    # Build prompt for Gemma 4
    content_payload = ""
    if has_ocr:
        content_payload += f"OCR Extracted Text:\n{request.ocr_text.strip()}\n\n"
    content_payload += f"Requested Reading Mode: {request.reading_mode}\n"
    content_payload += "Extract and structure this text according to the system instructions."

    try:
        raw_response = generate_text(
            prompt=f"{CAMPUS_READER_SYSTEM_PROMPT}\n\nInput:\n{content_payload}",
            api_key=settings.GEMINI_API_KEY,
            model=settings.GEMINI_MODEL,
        )

        # Parse JSON from model output
        cleaned_json = raw_response.strip()
        if cleaned_json.startswith("```json"):
            cleaned_json = cleaned_json[7:]
        if cleaned_json.startswith("```"):
            cleaned_json = cleaned_json[3:]
        if cleaned_json.endswith("```"):
            cleaned_json = cleaned_json[:-3]
        cleaned_json = cleaned_json.strip()

        parsed = json.loads(cleaned_json)

        confidence = float(parsed.get("confidence", 0.85))
        needs_rescan = bool(parsed.get("needs_rescan", False) or confidence < 0.65)
        spoken = parsed.get("spoken_summary", "")

        if needs_rescan or not spoken:
            spoken = "I couldn't read that clearly, please try again."

        return CampusReadingResponse(
            status="success",
            reading_mode=parsed.get("reading_mode", request.reading_mode),
            spoken_summary=spoken,
            confidence=confidence,
            needs_rescan=needs_rescan,
            source_text=parsed.get("source_text", request.ocr_text or ""),
            door_sign=DoorSignInfo(**parsed["door_sign"]) if parsed.get("door_sign") else None,
            timetable_items=[TimetableItem(**item) for item in parsed.get("timetable_items", [])],
            notices=[NoticeItem(**item) for item in parsed.get("notices", [])],
            uncertainties=parsed.get("uncertainties", []),
            unchecked_areas=parsed.get("unchecked_areas", ["Drop-offs and ground obstacles"]),
        )

    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        logger.warning("Gemma 4 output parsing failed: %s", exc)
        return CampusReadingResponse(
            status="low_confidence",
            reading_mode=request.reading_mode,
            spoken_summary="I couldn't read that clearly, please try again.",
            confidence=0.4,
            needs_rescan=True,
            source_text=request.ocr_text or "",
            uncertainties=["Structured extraction failed to decode safely."],
            unchecked_areas=["Ground obstacles below camera field of view"],
        )
    except GeminiServiceException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
