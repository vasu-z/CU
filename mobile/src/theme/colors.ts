/**
 * SAARTHI Design System — Restrained High-Contrast Accessible Palette
 *
 * Designed specifically for low-vision and blind university students:
 * - Restrained light background (#F8FAFC) with dark, high-contrast text (#0F172A).
 * - Single consistent authoritative accent color (Deep Navy Blue #1E3A8A).
 * - High contrast ratios (>10:1) exceeding standard accessibility thresholds.
 * - Meaningful semantic states (success, warning, error) with clear contrast.
 */
export const Colors = {
  // Restrained clean light backgrounds
  background: "#F8FAFC",
  backgroundAlt: "#F1F5F9",
  surface: "#FFFFFF",
  surfaceElevated: "#F8FAFC",
  surfaceTranslucent: "rgba(255, 255, 255, 0.96)",
  overlayTranslucent: "rgba(15, 23, 42, 0.65)",

  // Borders & Dividers
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  borderDark: "#94A3B8",
  borderActive: "#1E3A8A",

  // High-contrast readable typography
  textPrimary: "#0F172A",      // Deep slate black (>13:1 contrast against white)
  textSecondary: "#334155",    // Dark slate (>7:1 contrast)
  textMuted: "#64748B",        // Accessible slate
  textPlaceholder: "#94A3B8",
  textInverse: "#FFFFFF",

  // Consistent Primary Action Accent: Deep Navy Blue
  primary: "#1E3A8A",          // Authoritative, accessible deep navy
  primaryHover: "#172554",
  primaryLight: "#EFF6FF",
  primaryText: "#FFFFFF",

  // Secondary Accents & Controls
  accent: "#1E3A8A",
  accentText: "#FFFFFF",
  talkButton: "#1E3A8A",       // Deep navy for voice control
  talkButtonHover: "#172554",
  talkButtonGlow: "rgba(30, 58, 138, 0.25)",
  stopButton: "#991B1B",       // Crisp accessible deep red for Stop control
  stopButtonHover: "#7F1D1D",
  stopButtonGlow: "rgba(153, 27, 27, 0.25)",

  // Session & Semantic Status Indicators
  statusActive: "#15803D",     // Accessible forest green
  statusActiveDot: "#16A34A",
  statusActiveBg: "#DCFCE7",
  statusIdle: "#64748B",
  statusThinking: "#1E3A8A",
  statusThinkingBg: "#EFF6FF",

  // Feedback states
  success: "#15803D",
  successBackground: "#F0FDF4",
  error: "#B91C1C",
  errorBackground: "#FEF2F2",
  warning: "#B45309",
  warningBackground: "#FFFBEB",
} as const;

