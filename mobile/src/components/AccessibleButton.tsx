import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Colors } from "../theme/colors";

interface AccessibleButtonProps {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  variant?: "primary" | "accent" | "surface";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

/**
 * Large, accessible touch target button designed for visually impaired users.
 * Minimum touch target height: 56dp (exceeds WCAG 48dp guideline).
 */
export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
  label,
  onPress,
  accessibilityHint,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  textStyle,
}) => {
  const getBackgroundColor = (pressed: boolean) => {
    if (disabled) return Colors.surfaceElevated;
    if (variant === "accent") {
      return pressed ? "#172554" : Colors.accent;
    }
    if (variant === "surface") {
      return pressed ? Colors.backgroundAlt : Colors.surface;
    }
    return pressed ? "#172554" : Colors.primary;
  };

  const getTextColor = () => {
    if (disabled) return Colors.textMuted;
    if (variant === "accent") return Colors.accentText;
    if (variant === "surface") return Colors.textPrimary;
    return Colors.primaryText;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: getBackgroundColor(pressed),
          borderColor:
            variant === "surface" ? Colors.border : "transparent",
        },
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={getTextColor()}
          accessibilityLabel="Loading, please wait"
        />
      ) : (
        <Text
          style={[styles.label, { color: getTextColor() }, textStyle]}
          maxFontSizeMultiplier={2.0} // Prevents truncation when system font scaling is high
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    marginVertical: 6,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.4,
    textAlign: "center",
  },
});
