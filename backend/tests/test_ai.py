import base64
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from google.genai import errors

from app.core.config import Settings, get_settings
from app.main import app
from app.schemas.ai import DEFAULT_VISION_PROMPT

VALID_JPEG_BYTES = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00"
    b"\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19"
    b"\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f"
    b"'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xda\x00\x08"
    b"\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
)
VALID_JPEG_B64 = base64.b64encode(VALID_JPEG_BYTES).decode("utf-8")

VALID_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00"
    b"\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf\xa4q\x00\x00"
    b"\x00\x00IEND\xaeB`\x82"
)
VALID_PNG_B64 = base64.b64encode(VALID_PNG_BYTES).decode("utf-8")


@pytest.fixture
def client() -> TestClient:
    """FastAPI TestClient fixture."""
    return TestClient(app)


# ============================================================================
# Status & Text Generation Tests
# ============================================================================

def test_ai_status_unconfigured(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """When GEMINI_API_KEY is missing or empty, status reports configured: False without errors."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("GOOGLE_API_KEY", "")
    get_settings.cache_clear()

    response = client.get("/api/v1/ai/status")
    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is False
    assert "model" in data
    assert "key" not in data
    assert "GEMINI_API_KEY" not in str(data)


def test_ai_status_configured(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """When GEMINI_API_KEY is configured, status reports configured: True without leaking the key."""
    fake_key = "AIzaSyFakeSecretKeyForTestingPurposesOnly"
    monkeypatch.setenv("GEMINI_API_KEY", fake_key)
    get_settings.cache_clear()

    response = client.get("/api/v1/ai/status")
    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is True
    assert fake_key not in response.text
    assert "key" not in data


def test_ai_test_endpoint_missing_credentials(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Calling POST /api/v1/ai/test without a configured key returns HTTP 503."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("GOOGLE_API_KEY", "")
    get_settings.cache_clear()

    response = client.post("/api/v1/ai/test", json={"prompt": "Hello"})
    assert response.status_code == 503
    assert "Gemini API key is not configured" in response.json()["detail"]


@patch("app.services.gemini.get_gemini_client")
def test_ai_test_endpoint_successful_generation(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Calling POST /api/v1/ai/test with valid mock returns HTTP 200 and generated response."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-12345")
    get_settings.cache_clear()

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Hello! Navigation assistant ready."
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    response = client.post(
        "/api/v1/ai/test",
        json={"prompt": "Say hello"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["prompt"] == "Say hello"
    assert data["response"] == "Hello! Navigation assistant ready."
    assert "model" in data
    assert "test-key-12345" not in response.text


@patch("app.services.gemini.get_gemini_client")
def test_ai_test_endpoint_auth_error_handling(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Upstream 401/403 ClientError is mapped to safe HTTP 502 without exposing sensitive exception details."""
    monkeypatch.setenv("GEMINI_API_KEY", "invalid-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    client_err = errors.ClientError(401, "API_KEY_INVALID: User not authorized")
    mock_client.models.generate_content.side_effect = client_err
    mock_get_client.return_value = mock_client

    response = client.post("/api/v1/ai/test", json={"prompt": "Test"})
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "authentication failed" in detail.lower()
    assert "invalid-key" not in response.text


@patch("app.services.gemini.get_gemini_client")
def test_ai_test_endpoint_rate_limit_handling(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Upstream 429 ClientError is mapped to HTTP 429."""
    monkeypatch.setenv("GEMINI_API_KEY", "valid-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    rate_err = errors.ClientError(429, "RESOURCE_EXHAUSTED: Rate limit exceeded")
    mock_client.models.generate_content.side_effect = rate_err
    mock_get_client.return_value = mock_client

    response = client.post("/api/v1/ai/test", json={"prompt": "Test"})
    assert response.status_code == 429
    assert "rate limit" in response.json()["detail"].lower()


@patch("app.services.gemini.get_gemini_client")
def test_ai_test_endpoint_network_error_handling(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Network connection failure is mapped to safe HTTP 502 Bad Gateway."""
    monkeypatch.setenv("GEMINI_API_KEY", "valid-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = ConnectionError("Failed to resolve host")
    mock_get_client.return_value = mock_client

    response = client.post("/api/v1/ai/test", json={"prompt": "Test"})
    assert response.status_code == 502
    assert "failed to reach" in response.json()["detail"].lower()


def test_health_endpoint_independence(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Health check remains 200 OK regardless of whether Gemini API key is missing or invalid."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("GOOGLE_API_KEY", "")
    get_settings.cache_clear()

    health_response = client.get("/api/v1/health")
    assert health_response.status_code == 200
    assert health_response.json()["status"] == "ok"


# ============================================================================
# Vision Endpoint Tests (/api/v1/ai/vision)
# ============================================================================

def test_ai_vision_missing_credentials(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Calling POST /api/v1/ai/vision without configured API key returns HTTP 503."""
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("GOOGLE_API_KEY", "")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": VALID_JPEG_B64, "prompt": "Describe this"},
    )
    assert response.status_code == 503
    assert "Gemini API key is not configured" in response.json()["detail"]


def test_ai_vision_empty_image_data(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Sending an empty base64 string returns HTTP 400 Bad Request."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": "   ", "prompt": "Test"},
    )
    assert response.status_code == 400
    assert "cannot be empty" in response.json()["detail"]


def test_ai_vision_malformed_base64(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Sending malformed Base64 data returns HTTP 400 Bad Request."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": "ThisIsNotValidBase64@@@!!!", "prompt": "Test"},
    )
    assert response.status_code == 400
    assert "malformed Base64" in response.json()["detail"]


def test_ai_vision_unsupported_mime_type(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Sending an unsupported MIME type (e.g., image/gif) returns HTTP 400."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    get_settings.cache_clear()

    response = client.post(
        "/api/v1/ai/vision",
        json={
            "image_base64": VALID_JPEG_B64,
            "mime_type": "image/gif",
        },
    )
    assert response.status_code == 400
    assert "Unsupported image MIME type" in response.json()["detail"]


def test_ai_vision_invalid_image_magic_bytes(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Valid Base64 text that does not have JPEG or PNG magic bytes returns HTTP 400."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    get_settings.cache_clear()

    text_bytes = b"Hello, this is just plain text, not an image file."
    text_b64 = base64.b64encode(text_bytes).decode("utf-8")

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": text_b64, "mime_type": "image/jpeg"},
    )
    assert response.status_code == 400
    assert "does not match a valid JPEG or PNG signature" in response.json()["detail"]


def test_ai_vision_oversized_image(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    """Decoded image data exceeding 8 MB returns HTTP 413 Payload Too Large."""
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    get_settings.cache_clear()

    # Create dummy bytes starting with JPEG signature but exceeding 8 MB
    oversized_bytes = b"\xff\xd8\xff" + b"\x00" * (8 * 1024 * 1024 + 100)
    oversized_b64 = base64.b64encode(oversized_bytes).decode("utf-8")

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": oversized_b64},
    )
    assert response.status_code == 413
    assert "exceeds the maximum allowed limit of 8 MB" in response.json()["detail"]


@patch("app.services.gemini.get_gemini_client")
def test_ai_vision_successful_mocked_generation(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Valid JPEG request returns HTTP 200 with scene description, without echoing image_base64."""
    monkeypatch.setenv("GEMINI_API_KEY", "valid-vision-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "In front of you is a clear hallway with a wooden door 5 meters ahead."
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    response = client.post(
        "/api/v1/ai/vision",
        json={
            "image_base64": VALID_JPEG_B64,
            "prompt": "Are there any obstacles?",
            "mime_type": "image/jpeg",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["prompt"] == "Are there any obstacles?"
    assert data["description"] == "In front of you is a clear hallway with a wooden door 5 meters ahead."
    assert "model" in data
    # Crucial security & payload requirement: base64 image data is NOT echoed back
    assert "image_base64" not in data
    assert VALID_JPEG_B64 not in response.text


@patch("app.services.gemini.get_gemini_client")
def test_ai_vision_with_data_uri_prefix(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Base64 data containing data URI prefix (e.g. data:image/jpeg;base64,...) is correctly stripped and processed."""
    monkeypatch.setenv("GEMINI_API_KEY", "valid-vision-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "A desk with an open laptop."
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    data_uri = f"data:image/jpeg;base64,{VALID_JPEG_B64}"

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": data_uri},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["description"] == "A desk with an open laptop."


@patch("app.services.gemini.get_gemini_client")
def test_ai_vision_default_prompt_used_when_omitted(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """When prompt is omitted, DEFAULT_VISION_PROMPT is used for accessible guidance."""
    monkeypatch.setenv("GEMINI_API_KEY", "valid-vision-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Scene description for blind user."
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": VALID_JPEG_B64},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["prompt"] == DEFAULT_VISION_PROMPT


@patch("app.services.gemini.get_gemini_client")
def test_ai_vision_png_support(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Valid PNG image is accepted and processed."""
    monkeypatch.setenv("GEMINI_API_KEY", "valid-vision-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "PNG image processed successfully."
    mock_client.models.generate_content.return_value = mock_response
    mock_get_client.return_value = mock_client

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": VALID_PNG_B64, "mime_type": "image/png"},
    )

    assert response.status_code == 200
    assert response.json()["description"] == "PNG image processed successfully."


@patch("app.services.gemini.get_gemini_client")
def test_ai_vision_upstream_auth_error(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Upstream 401 ClientError maps to HTTP 502 Bad Gateway without leaking keys."""
    monkeypatch.setenv("GEMINI_API_KEY", "bad-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = errors.ClientError(401, "API_KEY_INVALID")
    mock_get_client.return_value = mock_client

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": VALID_JPEG_B64},
    )
    assert response.status_code == 502
    assert "authentication failed" in response.json()["detail"].lower()
    assert "bad-key" not in response.text


@patch("app.services.gemini.get_gemini_client")
def test_ai_vision_upstream_rate_limit(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Upstream 429 rate limit maps to HTTP 429 Too Many Requests."""
    monkeypatch.setenv("GEMINI_API_KEY", "valid-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = errors.ClientError(429, "RATE_LIMIT_EXCEEDED")
    mock_get_client.return_value = mock_client

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": VALID_JPEG_B64},
    )
    assert response.status_code == 429
    assert "rate limit" in response.json()["detail"].lower()


@patch("app.services.gemini.get_gemini_client")
def test_ai_vision_upstream_server_error(
    mock_get_client: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    """Upstream 500 ServerError maps to HTTP 502 Bad Gateway."""
    monkeypatch.setenv("GEMINI_API_KEY", "valid-key")
    get_settings.cache_clear()

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = errors.ServerError(500, "INTERNAL_ERROR")
    mock_get_client.return_value = mock_client

    response = client.post(
        "/api/v1/ai/vision",
        json={"image_base64": VALID_JPEG_B64},
    )
    assert response.status_code == 502
    assert "upstream server encountered an error" in response.json()["detail"].lower()
