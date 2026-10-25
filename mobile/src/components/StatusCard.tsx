import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../theme/colors";

interface StatusCardProps {
  title: string;
  status: "idle" | "loading" | "success" | "error";
  statusText: string;
  details?: string;
  accessibilityLabel?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  title,
  status,
  statusText,
  details,
  accessibilityLabel,
}) => {
  const getBadgeColors = () => {
    switch (status) {
      case "success":
        return {
          bg: Colors.successBackground,
          text: Colors.success,
          border: Colors.success,
        };
      case "error":
        return {
          bg: Colors.errorBackground,
          text: Colors.error,
          border: Colors.error,
        };
      case "loading":
        return {
          bg: "#075985",
          text: Colors.primary,
          border: Colors.primary,
        };
      default:
        return {
          bg: Colors.surfaceElevated,
          text: Colors.textMuted,
          border: Colors.border,
        };
    }
  };

  const badgeColors = getBadgeColors();
  const fullAccessibleLabel =
    accessibilityLabel || `${title}: ${statusText}. ${details || ""}`;

  return (
    <View
      style={styles.card}
      accessible={true}
      accessibilityRole="summary"
      accessibilityLabel={fullAccessibleLabel}
    >
      <View style={styles.headerRow}>
        <Text
          style={styles.title}
          maxFontSizeMultiplier={2.0}
        >
          {title}
        </Text>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: badgeColors.bg,
              borderColor: badgeColors.border,
            },
          ]}
        >
          <Text
            style={[styles.badgeText, { color: badgeColors.text }]}
            maxFontSizeMultiplier={1.8}
          >
            {statusText}
          </Text>
        </View>
      </View>

      {details ? (
        <Text
          style={styles.details}
          maxFontSizeMultiplier={2.0}
        >
          {details}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  details: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
});
