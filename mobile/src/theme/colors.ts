/**
 * SAARTHI Design System — High Contrast & Dark Palette
 *
 * Designed specifically for low-vision and blind accessibility (WCAG AAA compliant),
 * featuring deep charcoal surfaces, high-contrast text, vibrant semantic status indicators,
 * and prominent, easily tactile primary controls.
 */
export const Colors = {
  // Deep charcoal / near-black backgrounds
  background: "#08090D",
  backgroundAlt: "#0E1117",
  surface: "#121621",
  surfaceElevated: "#181D2B",
  surfaceTranslucent: "rgba(18, 22, 33, 0.88)",
  overlayTranslucent: "rgba(8, 9, 13, 0.72)",

  // Borders & Dividers
  border: "#2A3346",
  borderLight: "rgba(255, 255, 255, 0.12)",
  borderActive: "#8B5CF6",

  // High-contrast readable typography
  textPrimary: "#FFFFFF",
  textSecondary: "#E2E8F0",
  textMuted: "#94A3B8",
  textPlaceholder: "#64748B",

  // Primary Action Accents
  talkButton: "#7C3AED",       // Rich violet/purple for Talk control
  talkButtonHover: "#6D28D9",
  talkButtonGlow: "rgba(139, 92, 246, 0.45)",
  stopButton: "#DC2626",       // Crisp accessible red for Stop control
  stopButtonHover: "#B91C1C",
  stopButtonGlow: "rgba(220, 38, 38, 0.45)",

  // Accessibility & Diagnostics Accents
  primary: "#38BDF8",          // Sky cyan for focused elements
  primaryText: "#08090D",
  accent: "#FACC15",           // Bright yellow
  accentText: "#08090D",

  // Session & Semantic Status Indicators
  statusActive: "#22C55E",     // Bright green for active session
  statusActiveDot: "#4ADE80",
  statusActiveBg: "rgba(34, 197, 94, 0.18)",
  statusIdle: "#94A3B8",
  statusThinking: "#8B5CF6",
  statusThinkingBg: "rgba(139, 92, 246, 0.22)",

  // Feedback states
  success: "#4ADE80",
  successBackground: "#064E3B",
  error: "#F87171",
  errorBackground: "#7F1D1D",
  warning: "#FBBF24",
  warningBackground: "#78350F",
} as const;
