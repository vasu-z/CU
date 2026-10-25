# Saarthi — Standing Rules & Agent Guidelines

Project: AI navigation/reading assistant for visually impaired university students.  
Stack: React Native + Expo (Android AND iOS), FastAPI backend, Gemma 4 (open weights).  
Target Users: Blind and low-vision individuals. A wrong answer can cause physical harm. Safety beats cleverness.

---

## 1. Safety Rules (Non-Negotiable)

1. **No Hallucinations / Invention**: Never invent text, room numbers, directions, or distances. If unsure, explicitly say so.
2. **Confidence Thresholds**: Every AI output carries a confidence value (`confidence: float` between 0.0 and 1.0). Below threshold -> speak uncertainty and instruct the user to re-scan.
3. **Extraction vs. Reasoning**: Models EXTRACT raw observations/text; deterministic plain code REASONS (dates, routing graph, distances, math). No date math or spatial distance speculation by LLM.
4. **Fail Safe & Fail Audible**: Every single error path produces a clear, short spoken message through TTS and accessibility announcements.
5. **Cautious Spatial Assertions**: Never claim "the path is clear". Always report what was detected and state what was not checked (e.g. drop-offs, ground obstacles, out-of-frame areas).

---

## 2. Accessibility Rules

- **Universal Accessibility Props**: Every interactive control must have `accessibilityLabel`, `accessibilityRole`, and `accessibilityHint` where helpful.
- **Touch Targets**: Minimum 56dp x 56dp touch target size across all platforms.
- **Screen Reader Compatibility**: Must work seamlessly with TalkBack (Android) and VoiceOver (iOS).
- **Tactile / Spatial Layout**: Fixed corner layout for primary actions with a distinct haptic pattern per corner (`expo-haptics`).
- **No Visual-Only Information**: No information conveyed by color or visual appearance alone. All flows must be 100% operable without sight.
- **Dynamic Type & High Contrast**: Strict WCAG AAA contrast ratio compliance and dynamic font scaling support.

---

## 3. Engineering Rules

- **Type Safety**: TypeScript strict (`tsconfig.json` `strict: true`). Python typed with complete type annotations (validated with mypy/pyright).
- **Comprehensive Tests**: Automated tests for all non-UI logic (backend pytest, client parsing/reasoning unit tests). Run tests before saying "done".
- **API Verification**: Verify library APIs against official documentation and versioned READMEs before using them. Never guess signatures.
- **Hybrid AI Architecture**: Prefer on-device processing (ML Kit OCR, on-device Gemma) with cloud fallback (Gemini API Gemma 4 / cloud endpoints).
- **Security & Secrets**: Secrets strictly stored in `.env`; never commit API keys or sensitive tokens.
- **Git Hygiene**: Small, focused commits with descriptive messages.

---

## 4. Open-Source & Originality Rules

- **License Checks**: Before copying ANY code from another repo: read its LICENSE. Record repository URL, license type, what was used, and rationale in `THIRD_PARTY.md`. Prefer standard package manager dependencies (`npm`, `pip`) over copy-pasting code.
- **License Restrictions**: Do not copy AGPL/GPL code unless explicitly approved by the user.
- **Project License**: Apache-2.0.
- **AI Attribution**: Credit AI-assisted code generation clearly in `README.md`.

---

## 5. Behavioral Workflow

- **Plan First**: Present the plan, break into distinct phases, then implement phase by phase. Stop at the end of each phase for review.
- **Clarification Protocol**: Ask the user ONE question at a time, only when genuinely blocked.
- **Verification Guarantee**: Never mark work complete if tests fail or an API call was not actually exercised and verified.
