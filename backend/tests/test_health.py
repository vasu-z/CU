import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import Settings, get_settings


@pytest.fixture
def client() -> TestClient:
    """Fixture providing a FastAPI TestClient."""
    return TestClient(app)


def test_health_endpoint_status_code(client: TestClient) -> None:
    """Verify that the health check endpoint returns HTTP 200."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_health_endpoint_payload(client: TestClient) -> None:
    """Verify that the JSON response contains expected status, service name, and version."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200

    data = response.json()
    assert data == {
        "status": "ok",
        "service": "saarthi-backend",
        "version": "0.1.0",
    }
    assert data["status"] == "ok"
    assert data["service"] == "saarthi-backend"
    assert data["version"] == "0.1.0"


def test_health_endpoint_without_gemini_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify that the application starts and health endpoint responds without Gemini credentials."""
    # Ensure no Gemini or external service credentials exist in environment
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_KEY", raising=False)

    with TestClient(app) as clean_client:
        response = clean_client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "saarthi-backend"
        assert data["version"] == "0.1.0"


def test_docs_accessible(client: TestClient) -> None:
    """Verify that interactive API documentation is enabled and accessible at /docs."""
    response = client.get("/docs")
    assert response.status_code == 200


def test_cors_settings_disallows_wildcard_with_credentials() -> None:
    """Verify that setting CORS_ALLOW_CREDENTIALS=True with wildcard origin raises a validation error."""
    with pytest.raises(ValueError, match="Wildcard origin '\\*' cannot be used when CORS_ALLOW_CREDENTIALS is True"):
        Settings(CORS_ORIGINS=["*"], CORS_ALLOW_CREDENTIALS=True)
