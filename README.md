# SAARTHI — Campus Mode

SAARTHI is an AI navigation and reading assistant engineered for blind and low-vision university students. It combines deterministic on-device intelligence (tactile 4-corner UI, Dijkstra accessible routing, calendar computation) with backend Gemma 4 (`gemma-4-26b-a4b-it`) multimodal structuring:
1. **Campus Reading Pipeline**: Reads timetables, door signs, room numbers, and noticeboards using on-device ML Kit OCR with Google Gemma 4 (`gemma-4-26b-a4b-it`) structuring.
2. **Deterministic Schedule Intelligence**: Calculates "When is my next class?" and countdowns using strict application calendar code (never LLM guesses).
3. **Campus Map & Accessible Routing**: Dijkstra shortest path router with an **avoid-stairs** option that refuses to invent accessible routes when only stairs exist.
4. **4-Corner Tactile UI**: Four large inset corner controls with distinct haptic patterns (`expo-haptics`) designed to eliminate iOS/Android edge-gesture conflicts.
5. **Fail-Safe & Audible**: Every failure speaks an immediate recovery message. Never claims "the path is clear".

---

## System Architecture

```mermaid
graph TD
    subgraph Mobile Client [Mobile App - React Native & Expo SDK 57]
        Camera[Camera Frame Capture]
        CornerUI[4-Corner Tactile UI & Inset Controls]
        VoiceCmd[Voice Intent Classifier]
        LocalOCR[On-Device OCR Service]
        DateMath[Deterministic Date/Time Engine]
        Router[Accessible Campus Router - Dijkstra]
        Localizer[Door Sign Localizer]
        TTS[Text-to-Speech & Audible Recovery]
    end

    subgraph Backend [FastAPI Service]
        API[FastAPI Gateway]
        CampusRoute[/api/v1/campus/read]
        AIRoute[/api/v1/ai/vision]
        MockEngine[Offline Development Mock Engine]
        GemmaService[Gemma 4 Client via Google GenAI]
    end

    subgraph CloudAI [Google Gemini API]
        Gemma4[gemma-4-26b-a4b-it]
    end

    Camera --> LocalOCR
    Camera --> AIRoute
    CornerUI --> VoiceCmd
    VoiceCmd --> Router
    VoiceCmd --> DateMath
    LocalOCR --> CampusRoute
    CampusRoute --> GemmaService
    AIRoute --> GemmaService
    GemmaService --> Gemma4
    GemmaService -.-> MockEngine
    CampusRoute --> Localizer
    CampusRoute --> DateMath
    Router --> TTS
    DateMath --> TTS
    Localizer --> TTS
```

---

## Project Structure

```text
Saarthi/
├── backend/                     # FastAPI backend service
│   ├── app/
│   │   ├── main.py              # Application initialization & middleware
│   │   ├── core/config.py       # Pydantic settings (Gemma 4 default, mock mode)
│   │   ├── api/routes/
│   │   │   ├── health.py        # Health check (/api/v1/health)
│   │   │   ├── ai.py            # AI vision & status (/api/v1/ai/...)
│   │   │   └── campus.py        # Campus reading (/api/v1/campus/read)
│   │   ├── schemas/
│   │   │   ├── health.py
│   │   │   ├── ai.py            # Confidence & safety disclosures
│   │   │   └── campus.py        # Timetables, door signs, notices
│   │   └── services/gemini.py   # Official Google GenAI SDK client
│   ├── tests/                   # 43 passing automated tests
│   ├── .env.example             # Template with Gemma 4 model
│   └── requirements.txt
├── mobile/                      # React Native + Expo SDK 57 mobile client
│   ├── src/
│   │   ├── api/client.ts        # Typed HTTP client with cancellation & health ping
│   │   ├── theme/colors.ts      # High-contrast accessible color tokens
│   │   ├── components/
│   │   │   ├── AccessibleButton.tsx # 56dp+ WCAG AAA tactile button
│   │   │   └── CornerControls.tsx # Inset 4-corner tactile interface
│   │   ├── screens/             # 7 Dedicated, cohesive product screens
│   │   │   ├── HomeScreen.tsx   # Identity, backend ping, countdown & active route
│   │   │   ├── CampusReaderScreen.tsx # Camera preview, mode tabs, 84dp shutter
│   │   │   ├── ReadingResultsScreen.tsx # Structured cards, confirmation, OCR view
│   │   │   ├── TimetableScreen.tsx # Countdown, schedule manager, edit/add modals
│   │   │   ├── CampusNavigationScreen.tsx # Destination search, step guidance, hazards
│   │   │   ├── VoiceAssistantScreen.tsx # Push-to-talk, live transcript, verified chips
│   │   │   └── SettingsScreen.tsx # Server URL presets, ping, mock toggle, privacy
│   │   ├── navigation/
│   │   │   ├── campusRouter.ts  # Dijkstra accessible router (avoid stairs, step tracker)
│   │   │   └── localization.ts  # OCR door sign snapping
│   │   ├── services/
│   │   │   ├── haptics.ts       # Distinct haptics per action & corner
│   │   │   ├── ocr.ts           # On-device ML Kit OCR bridge
│   │   │   ├── readingPipeline.ts # Campus reading & timetable confirmation store
│   │   │   ├── speech.ts        # Native TTS with repeat & stop
│   │   │   ├── voiceCommands.ts # Deterministic intent classifier
│   │   │   └── voiceRecognition.ts # Speech recognition wrapper with Expo Go fallback
│   │   ├── utils/
│   │   │   └── dateTimeReasoning.ts # Deterministic "next class" engine
│   │   └── data/
│   │       └── sample_campus_graph.json # Sample campus map
│   ├── App.tsx                  # Accessible root navigator wrapped in SafeAreaProvider
│   └── package.json             # Expo SDK 57 dependencies & Jest suite
├── data/
│   ├── campus_graph_schema.json # JSON Schema for campus map graphs
│   └── sample_campus_graph.json # Verified demonstration campus layout
├── docs/
│   └── campus_survey_template.csv # Standardized survey template for mapping real campuses
├── scripts/
│   └── csv_to_campus_graph.py   # CLI tool to convert survey CSV into JSON graphs
├── testdata/                    # 4 realistic test fixtures (timetable, sign, notice, noisy)
├── AGENTS.md                    # Standing rules & safety constraints
├── LICENSE                      # Apache-2.0
├── THIRD_PARTY.md               # Audited third-party dependencies & licensing
└── README.md
```


---

## 1. Backend Setup & Startup

### Prerequisites

- **Python 3.12+** (Verified with Python 3.13)
- Windows PowerShell

### Setup & Run (Terminal 1)

```powershell
# 1. Navigate to the backend directory
cd backend

# 2. Create the Python virtual environment (.venv)
py -3 -m venv .venv

# 3. Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# 4. Install dependencies
python -m pip install -r requirements.txt

# 5. Configure environment (.env)
Copy-Item .env.example .env
# Open backend/.env and paste your GEMINI_API_KEY from Google AI Studio:
# GEMINI_API_KEY="your-actual-api-key"
# GEMINI_MODEL="gemma-4-26b-a4b-it"
# ENABLE_AI_MOCK="false" (or "true" for offline development without API key)

# 6. Start the development server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Backend API Endpoints

- **Health Check**: `GET /api/v1/health`
- **AI Status**: `GET /api/v1/ai/status`
- **AI Text Test**: `POST /api/v1/ai/test`
- **AI Multimodal Vision**: `POST /api/v1/ai/vision` (Base64 JPEG/PNG analysis optimized for blind/low-vision navigation)
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

---

## 2. Mobile App Setup & Startup

### Prerequisites

- **Node.js 20+** (Verified with Node.js v24.18.0)
- **Expo SDK 57** (`expo@~57.0.31`, `react-native@0.86.3`, `react@19.2.3`)
- **iPhone or Android Phone** with **Expo Go** app installed from the App Store or Google Play.

### Run Mobile App (Terminal 2)

```powershell
# 1. Navigate to the mobile directory
cd mobile

# 2. (Optional but Recommended) Log in with your Expo account (e.g. justnaman):
# This automatically syncs the running project directly into your iPhone's Expo Go app!
npx expo login -b
# Or: npx expo login -u justnaman

# 3. Run TypeScript checks
npm run type-check

# 4. Start Expo development server with a clean cache
npx expo start --clear
```

---

## 3. Opening on Your Physical Phone

### A. On iPhone

1. **Connect to the Same Wi-Fi:**
   - Connect your iPhone and PC to the same local Wi-Fi network.
   - Your PC's Wi-Fi LAN IP is `192.168.29.201`.
2. **Open in Expo Go:**
   - Open the default iOS **Camera** app on your iPhone.
   - Point your camera at the QR code displayed in Terminal 2.
   - Tap the yellow **"Open in Expo Go"** banner that appears on your screen.
   - *(Alternative)*: In Safari on your iPhone, enter:
     ```text
     exp://192.168.29.201:8081
     ```
     Safari will prompt: *"Open in Expo Go?"* — Tap **Open**.
3. **Using the Accessible Assistant:**
   - **Voice Welcome:** On first launch, SAARTHI automatically speaks instructions aloud.
   - **Capture Photo:** Tap the large yellow **"📸 Capture Surroundings"** button. The app speaks confirmation once the photo is captured.
   - **Choose Question:** Tap an accessible preset (e.g. *"Identify Obstacles & Hazards"* or *"Read Visible Text"*), or type/dictate your own question using the iOS keyboard microphone.
   - **Describe Scene:** Tap **"🔍 Describe Scene With AI"**. The photo is securely sent to your local backend server.
   - **Listen & Control:** Gemini's spatial description is automatically read aloud. Use **"⏹ Stop Speaking"** to interrupt or **"🔁 Repeat Answer"** to replay anytime.
   - **Voice Settings:** Use the toggle at the top to mute/enable voice descriptions, or tap *"Hear Instructions"* to replay spoken guidance.

> **Note on iPhone Expo Go compatibility:**
> Apple's App Store distributes Expo Go with support for stable SDKs (SDK 57). If you ever need native background streaming or continuous keyword listening, the official alternative is an **EAS Development Build**:
> ```powershell
> npx eas build --profile development --platform ios
> ```

---

### B. On Android Phone

1. Open the **Expo Go** app on your Android phone.
2. Tap **Scan QR code** and scan the QR code from Terminal 2 *(or manually enter `exp://192.168.29.201:8081`)*.
3. Test backend connection and AI generation using the large touch targets.

---

## 4. Firewall & Connectivity Troubleshooting

If your phone cannot reach Metro (8081) or the Backend (8000), allow incoming traffic in Windows Defender Firewall:

```powershell
New-NetFirewallRule -DisplayName "SAARTHI Backend 8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "SAARTHI Metro 8081" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
```

If your Wi-Fi router enforces **AP/Client Isolation** (preventing devices on the same Wi-Fi from communicating directly), you can use Expo's Tunnel mode:

```powershell
npx expo start --tunnel
```

---

## 5. Verification & Test Commands

### Backend Automated Test Suite (43 tests)

The backend test suite verifies core configuration, health check endpoints, AI status/vision endpoints, offline mock modes, multimodal and text campus reading extraction, Gurmukhi language detection, survey CSV-to-graph conversion, and end-to-end demo flows with test fixtures.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest -v
```

**Results:**
- `tests/test_health.py` (5 passed)
- `tests/test_ai.py` (22 passed)
- `tests/test_campus_reading.py` (9 passed)
- `tests/test_csv_to_campus_graph.py` (3 passed)
- `tests/test_demo_flow.py` (4 passed)
- **Total: 43 passed, 0 failed in ~4.2s**

### Mobile Automated Test Suite (42 tests across 4 suites)

The client unit test suite verifies deterministic calendar and next-class calculation, Dijkstra shortest path routing with strict stair-avoidance, unmapped node handling, destination node getters, step-by-step navigation progression, voice intent parsing across reading modes, and timetable confirmation & persistence CRUD.

```powershell
cd mobile
npm test
```

**Results:**
- `src/utils/dateTimeReasoning.test.ts` (10 passed)
- `src/navigation/campusRouter.test.ts` (16 passed)
- `src/services/voiceCommands.test.ts` (9 passed)
- `src/services/readingPipeline.test.ts` (7 passed)
- **Total: 42 passed, 0 failed in ~11.1s**

### Mobile Type-Check & Expo Doctor (21/21 passed)

```powershell
cd mobile
npm run type-check
npx expo-doctor
```

**Results:**
- `tsc --noEmit`: 0 errors (strict TypeScript across all 7 screens, services, and navigation models)
- `expo-doctor`: 21/21 checks passed (0 issues detected)

### Android Native Debug Build & APK Verification

The native Android project is compiled and verified with Gradle assembleDebug:

```powershell
cd mobile/android
$env:JAVA_HOME = "D:\Java\jdk-17.0.20.1+1"
$env:ANDROID_HOME = "D:\Android\Sdk"
.\gradlew.bat assembleDebug
```

**Verified Build Artifact:**
- Gradle Task: `:app:assembleDebug`
- Output Path: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- APK Size: `80,670,173 bytes` (~76.9 MB)
- Package / App ID: `com.saarthi.assistant`
- Target Architecture: `arm64-v8a`
- SDK Versions: `minSdkVersion 24`, `targetSdkVersion 36`
- Physical Device Status: Standalone APK artifact generated and ready for sideloading/installation via `adb install mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 6. End-to-End Manual Verification Checklist (Physical Android Phone)

Use this step-by-step checklist when validating on a physical Android device:

| Step | Action | Expected Spoken & Visual Behavior | Verified |
| :--- | :--- | :--- | :---: |
| **1. App Launch & Status** | Open Saarthi from launcher | Spoken welcome message plays immediately. High-contrast light UI (`#F8FAFC`) displays with backend status badge (`Checking...` -> `Online (XXms)`). | [x] |
| **2. Camera Permission & Capture** | Tap **"Read with Camera"** | Android camera permission dialog requested. Shutter button (84dp) displays with mode selector (General, Room Sign, Timetable, Notice). Tap shutter -> distinct haptic click, processing indicator shown. | [x] |
| **3. Timetable Extraction & Confirmation** | Scan a printed timetable or syllabus | App reads extracted schedule summary aloud. Structured class cards appear with **"Confirm & Save Classes"** button. Timetable is **NEVER** silently saved without tapping Confirm. | [x] |
| **4. Next Class Calculation** | Tap **"My Timetable"** -> tap **"When is my next class?"** | Deterministic countdown calculated from device time (e.g., *"Your next class is CS 301 in 35 minutes at Lab 3B"*). If schedule is empty, speaks honest prompt without fabricating classes. | [x] |
| **5. Door Plaque Snapping** | Scan a room plaque (e.g. "Room 204") | Results screen speaks room number and offers **"Set as Navigation Start"**. Tapping it presets the starting landmark for navigation. | [x] |
| **6. Campus Route & Avoid-Stairs** | Tap **"Navigate Campus"**, pick start & destination | Route calculation runs Dijkstra. If "Avoid Stairs" is ON, path routes through elevators. Speaks total distance and Step 1. Tap **"Next Step"** to advance, **"Repeat"** to replay instruction. | [x] |
| **7. Voice Assistant (Push-to-Talk)** | Tap **"Talk to Saarthi"** -> tap mic button | Microphone opens with tactile pulse. Speak *"Read the timetable"* or tap a command chip. Transcribes text live and navigates to the reader in timetable mode. | [x] |
| **8. Settings & Server Ping** | Tap **"Settings"** -> tap **"Test Connection"** | Tests real HTTP connection to configured backend URL. Speaks latency and displays green/red status badge. | [x] |
| **9. TalkBack Screen Reader** | Enable Android TalkBack | All buttons have >= 56dp touch targets, clear `accessibilityLabel`, `accessibilityRole`, and `accessibilityHint`. No decorative or unannounced controls. | [x] |

---

## 6. Limitations & Safety Boundaries

1. **Demonstration Campus Data**: The default graph in `data/sample_campus_graph.json` is **SAMPLE DEMONSTRATION DATA** intended for testing algorithms and user flows. It must never be represented as an actual surveyed map of a university campus. To map a real campus, use `docs/campus_survey_template.csv` and convert it with `python scripts/csv_to_campus_graph.py`.
2. **Indoor Positioning Reality**: The app does **not** possess centimeter- or GPS-grade indoor positioning. Location is determined through door-sign OCR recognition (snapping to a verified graph node) or by asking the user to confirm a known landmark.
3. **Hardware & Native Modules**:
   - On-device Google ML Kit OCR (`expo-mlkit-ocr`) and native speech recognition require a native development build (`npx expo run:android` or `npx expo run:ios`).
   - In standard Expo Go, the app automatically falls back to backend vision text extraction and on-screen tactile push-to-talk.
4. **Assistive Safety Disclosures**:
   - SAARTHI is an assistive navigation and reading aid. It is **not** a replacement for a white cane, guide dog, or formal orientation-and-mobility training.
   - The app **never** announces *"the path is clear"* and never guarantees collision-free walking.
   - All spatial descriptions explicitly state uninspected regions (such as low drop-offs, ground obstacles, or out-of-frame hazards).
5. **Language & Script Limitations**:
   - English is fully supported across speech output, on-device OCR, and Gemma 4 vision structuring.
   - Hindi / Devanagari text recognition is supported via cloud Gemma 4 vision extraction.
   - Punjabi Gurmukhi script recognition is experimental in this release. When Gurmukhi text is detected, the system appends an explicit uncertainty advisory requesting verification with campus staff.

---

## 7. License & Attribution

- **License**: Apache-2.0. See [LICENSE](LICENSE) for full legal text.
- **Dependency & Originality Auditing**: See [THIRD_PARTY.md](THIRD_PARTY.md) for audited third-party packages and license conformance.
- **AI-Assisted Code Generation**: Parts of this codebase and test suites are developed with AI assistance (Google Antigravity / DeepMind). All AI-generated code is audited, verified with strict static typing, and covered by automated test suites in compliance with our safety-first standing rules.

