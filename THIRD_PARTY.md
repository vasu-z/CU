# Third-Party Code & Dependency Audit

This document tracks all external code, libraries, and assets used in the **Saarthi** project in accordance with our standing open-source & originality rules.

## Policy
1. **Dependency First**: Always prefer using libraries as verified dependencies (`npm`, `pip`) over copy-pasting code.
2. **License Vetting**: Before incorporating code or dependencies:
   - Check and record the license.
   - Do **NOT** copy or include AGPL/GPL licensed code without explicit user approval.
3. **Tracking Requirement**: Any copied or adapted code snippet must be logged below with repository URL, author, commit/version, license type, exact files affected, and architectural rationale.

---

## Direct Dependencies Audit

### Backend (Python / FastAPI)
| Package | License | Purpose |
| :--- | :--- | :--- |
| `fastapi` | MIT | High-performance async REST API framework |
| `uvicorn` | BSD-3-Clause | ASGI server implementation |
| `pydantic` | MIT | Strict data validation and schema definitions |
| `pydantic-settings` | MIT | Typed environment configuration management |
| `google-genai` | Apache-2.0 | Official Google GenAI SDK for Gemini / Gemma models |
| `pytest` | MIT | Automated test framework |
| `httpx` | BSD-3-Clause | Async HTTP client for integration test execution |

### Mobile Client (React Native / Expo SDK 57)
| Package | License | Purpose |
| :--- | :--- | :--- |
| `expo` | MIT | Core Expo SDK runtime |
| `react` / `react-native` | MIT | Cross-platform declarative UI runtime |
| `expo-camera` | MIT | Native camera view and frame capture |
| `expo-speech` | MIT | Native Text-to-Speech (TTS) for audible responses |
| `expo-speech-recognition` | MIT | Real-time on-device voice input transcription |
| `expo-haptics` | MIT | Tactile feedback patterns for corner navigation and buttons |
| `@react-native-async-storage/async-storage` | MIT | On-device persistent key-value storage |
| `react-native-safe-area-context` | MIT | Dynamic safe area handling for notch/island |
| `@expo/vector-icons` | MIT | Accessible iconography |
| `expo-mlkit-ocr` | MIT | On-device Google ML Kit Text Recognition v2 |
| `jest` / `ts-jest` | MIT | Unit testing suite for deterministic application logic |


---

## Third-Party Code Snippets
*No third-party code snippets have been copy-pasted into this repository. All external functionality is strictly consumed via licensed package managers.*
