# SAARTHI

SAARTHI is an AI-powered visual navigation assistant designed to empower visually impaired users with real-time situational awareness and spatial guidance.

## Project Structure

```text
Saarthi/
├── backend/                     # FastAPI backend service
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI application initialization & middleware
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   └── config.py        # Environment-based configuration (pydantic-settings)
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes/
│   │   │       ├── __init__.py  # Aggregated API router
│   │   │       └── health.py    # Health check endpoint (/api/v1/health)
│   │   │       └── ai.py        # AI status & connectivity test (/api/v1/ai/...)
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── health.py        # Pydantic schemas for health responses
│   │   │   └── ai.py            # Pydantic schemas for AI status and test requests
│   │   └── services/
│   │       ├── __init__.py
│   │       └── gemini.py        # Official google-genai SDK client & text generation
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_health.py       # Health endpoint & CORS test suite
│   │   └── test_ai.py           # AI status, mocking, error handling & security tests
│   ├── .env.example             # Safe template for environment configuration
│   ├── .gitignore               # Backend gitignore rules
│   └── requirements.txt         # Python dependencies
├── mobile/                      # Mobile app (React Native + Expo SDK 57 + TypeScript)
│   ├── assets/                  # App icons and splash assets
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts        # Typed API client for FastAPI backend communication
│   │   ├── config/
│   │   │   └── env.ts           # Configurable backend base URL (LAN IP & presets)
│   │   ├── theme/
│   │   │   └── colors.ts        # High-contrast WCAG AAA accessibility color tokens
│   │   └── components/
│   │       ├── AccessibleButton.tsx # Min 56dp touch targets with VoiceOver/TalkBack labels
│   │       └── StatusCard.tsx       # High-contrast system and AI status badges
│   ├── App.tsx                  # Accessible starter screen for visual navigation
│   ├── app.json                 # Expo app configuration (SDK 57)
│   ├── package.json             # Expo SDK 57 dependencies (React Native 0.86, React 19.2)
│   ├── tsconfig.json            # TypeScript strict configuration
│   └── .gitignore               # Mobile gitignore rules
├── .gitignore                   # Root repository gitignore
└── README.md                    # Project documentation
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
# GEMINI_MODEL="gemini-3.5-flash"

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

## 5. Verification Commands

### Backend Tests (26 tests)
```powershell
cd backend
python -m pytest -v
```

### Mobile Health Check (Expo Doctor & TypeScript)
```powershell
cd mobile
npx expo-doctor
npm run type-check
```
