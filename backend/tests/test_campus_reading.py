import json
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from app.core.config import get_settings
from app.main import app

@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_campus_read_missing_payload(client: TestClient) -> None:
    """Returns 400 if neither ocr_text nor image_base64 is provided."""
    response = client.post("/api/v1/campus/read", json={})
    assert response.status_code == 400
    assert "either ocr_text or image_base64" in response.json()["detail"].lower()


def test_campus_read_unreadable_noisy_text_fails_audible(client: TestClient) -> None:
    """Short or noisy OCR (<4 chars) produces audible retry message (Rule 4)."""
    response = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": "xyz", "reading_mode": "auto"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["needs_rescan"] is True
    assert data["confidence"] <= 0.5
    assert "couldn't read that clearly" in data["spoken_summary"].lower()


def test_campus_read_timetable_mock_mode(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Mock mode correctly generates structured timetable items."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("ENABLE_AI_MOCK", "True")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": "Weekly Class Timetable Schedule", "reading_mode": "timetable"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "mock_success"
    assert data["reading_mode"] == "timetable"
    assert len(data["timetable_items"]) >= 1
    assert data["timetable_items"][0]["course_code"] == "CS201"
    assert data["timetable_items"][0]["room"] == "Room 204"
    assert data["needs_rescan"] is False
    assert "CS201" in data["spoken_summary"]


def test_campus_read_door_sign_mock_mode(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Mock mode correctly structures classroom door sign plaque."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("ENABLE_AI_MOCK", "True")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": "Room 204 Computer Science Department", "reading_mode": "sign"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["reading_mode"] == "sign"
    assert data["door_sign"] is not None
    assert "204" in data["door_sign"]["room_number"]
    assert "Computer Science" in data["door_sign"]["department"]


def test_campus_read_notice_mock_mode(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Mock mode correctly extracts notice with raw date text."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("ENABLE_AI_MOCK", "True")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": "Assignment 2 deadline announcement", "reading_mode": "notice"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["reading_mode"] == "notice"
    assert len(data["notices"]) >= 1
    assert "October 28" in data["notices"][0]["raw_date_text"]


@patch("app.api.routes.campus.generate_text")
def test_campus_read_gemma_json_parsing(
    mock_generate: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Tests successful structured JSON parsing from Gemma 4 output."""
    monkeypatch.setenv("GEMINI_API_KEY", "real-key")
    monkeypatch.setenv("ENABLE_AI_MOCK", "False")
    get_settings.cache_clear()

    mock_llm_json = {
        "reading_mode": "timetable",
        "spoken_summary": "You have Physics at 11 AM in Hall C.",
        "confidence": 0.95,
        "needs_rescan": False,
        "source_text": "PHY101 Mon 11:00 Hall C",
        "timetable_items": [
            {
                "course_code": "PHY101",
                "course_name": "General Physics",
                "day_of_week": "Monday",
                "start_time": "11:00",
                "end_time": "12:30",
                "room": "Hall C",
                "confidence": 0.95,
            }
        ],
        "uncertainties": [],
        "unchecked_areas": ["Ground obstacles"],
    }
    mock_generate.return_value = f"```json\n{json.dumps(mock_llm_json)}\n```"

    response = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": "PHY101 Mon 11:00 Hall C", "reading_mode": "timetable"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["confidence"] == 0.95
    assert data["timetable_items"][0]["course_code"] == "PHY101"
    assert "Physics" in data["spoken_summary"]


@patch("app.api.routes.campus.generate_text")
def test_campus_read_malformed_llm_output_fails_safely(
    mock_generate: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """When Gemma 4 returns malformed non-JSON, falls back safely to audible retry."""
    monkeypatch.setenv("GEMINI_API_KEY", "real-key")
    monkeypatch.setenv("ENABLE_AI_MOCK", "False")
    get_settings.cache_clear()

    mock_generate.return_value = "Sorry, I am not able to parse this as JSON."

    response = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": "Some text", "reading_mode": "auto"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["needs_rescan"] is True
    assert "couldn't read that clearly" in data["spoken_summary"].lower()


@patch("app.api.routes.campus.generate_campus_structured_content")
def test_campus_read_with_image_calls_multimodal(
    mock_multimodal: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Tests that sending image_base64 invokes generate_campus_structured_content."""
    import base64
    monkeypatch.setenv("GEMINI_API_KEY", "real-key")
    monkeypatch.setenv("ENABLE_AI_MOCK", "False")
    get_settings.cache_clear()

    # Valid 1x1 JPEG bytes
    dummy_jpeg_b64 = base64.b64encode(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb").decode("ascii")

    mock_llm_json = {
        "reading_mode": "sign",
        "spoken_summary": "Door sign for Room 101.",
        "confidence": 0.90,
        "needs_rescan": False,
        "source_text": "Room 101",
        "door_sign": {
            "room_number": "Room 101",
            "department": "Engineering",
            "occupants": [],
            "status": "Available",
        },
        "uncertainties": [],
        "unchecked_areas": ["Ground level"],
    }
    mock_multimodal.return_value = json.dumps(mock_llm_json)

    response = client.post(
        "/api/v1/campus/read",
        json={"image_base64": dummy_jpeg_b64, "reading_mode": "sign"},
    )
    assert response.status_code == 200
    assert mock_multimodal.called
    data = response.json()
    assert data["door_sign"]["room_number"] == "Room 101"


@patch("app.api.routes.campus.generate_text")
def test_campus_read_gurmukhi_detected_adds_uncertainty(
    mock_generate: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Verifies that Punjabi Gurmukhi text appends an explicit experimental uncertainty disclaimer."""
    monkeypatch.setenv("GEMINI_API_KEY", "real-key")
    monkeypatch.setenv("ENABLE_AI_MOCK", "False")
    get_settings.cache_clear()

    mock_llm_json = {
        "reading_mode": "notice",
        "spoken_summary": "Notice about Punjabi university events.",
        "confidence": 0.88,
        "needs_rescan": False,
        "source_text": "ਯੂਨੀਵਰਸਿਟੀ ਨੋਟਿਸ",
        "uncertainties": [],
        "unchecked_areas": ["Surroundings"],
    }
    mock_generate.return_value = json.dumps(mock_llm_json)

    # Contains Gurmukhi chars: ਯੂਨੀਵਰਸਿਟੀ (University in Punjabi)
    response = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": "ਯੂਨੀਵਰਸਿਟੀ ਨੋਟਿਸ 2026", "reading_mode": "notice"},
    )
    assert response.status_code == 200
    data = response.json()
    assert any("Gurmukhi" in u for u in data["uncertainties"])

