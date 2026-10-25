import json
import os
import pytest
from fastapi.testclient import TestClient
from app.core.config import get_settings
from app.main import app

FIXTURE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "testdata"))


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_demo_fixture_timetable(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Verifies reading a university timetable from testdata fixture in mock mode."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("ENABLE_AI_MOCK", "True")
    get_settings.cache_clear()

    fixture_path = os.path.join(FIXTURE_DIR, "timetable_fixture.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    res = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": fixture["ocr_text"], "reading_mode": fixture["category"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "mock_success"
    assert data["reading_mode"] == "timetable"
    assert len(data["timetable_items"]) >= 1
    assert data["timetable_items"][0]["course_code"] == "CS201"
    assert data["needs_rescan"] is False


def test_demo_fixture_door_sign(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Verifies reading a classroom door plaque from testdata fixture."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("ENABLE_AI_MOCK", "True")
    get_settings.cache_clear()

    fixture_path = os.path.join(FIXTURE_DIR, "door_sign_fixture.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    res = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": fixture["ocr_text"], "reading_mode": fixture["category"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["door_sign"] is not None
    assert "204" in data["door_sign"]["room_number"]
    assert "Computer Science" in data["door_sign"]["department"]


def test_demo_fixture_notice_board(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Verifies reading an assignment notice board from testdata fixture."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("ENABLE_AI_MOCK", "True")
    get_settings.cache_clear()

    fixture_path = os.path.join(FIXTURE_DIR, "notice_fixture.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    res = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": fixture["ocr_text"], "reading_mode": fixture["category"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["reading_mode"] == "notice"
    assert len(data["notices"]) >= 1
    assert "October 28" in data["notices"][0]["raw_date_text"]


def test_demo_fixture_unreadable_noisy_scan_audible_recovery(client: TestClient) -> None:
    """Verifies noisy/unreadable scan returns immediate audible recovery message (Rule 4)."""
    fixture_path = os.path.join(FIXTURE_DIR, "unreadable_fixture.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    res = client.post(
        "/api/v1/campus/read",
        json={"ocr_text": fixture["ocr_text"], "reading_mode": "auto"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["needs_rescan"] is True
    assert data["confidence"] <= 0.5
    assert "couldn't read that clearly" in data["spoken_summary"].lower()
