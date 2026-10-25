import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../theme/colors";

interface HomeControlsProps {
  onStop: () => void;
  onTalk: () => void;
  isProcessing?: boolean;
  isListening?: boolean;
  talkLabel?: string;
}

/**
 * Rebuilt minimal two-button bottom controls for SAARTHI:
 * Left: Stop (Red circular button with stop icon and text label)
 * Right: Talk to SAARTHI (Purple circular button with microphone icon and text label)
 *
 * Meets WCAG AAA touch target requirements (min 78dp diameter) with high contrast.
 */
export const HomeControls: React.FC<HomeControlsProps> = ({
  onStop,
  onTalk,
  isProcessing = false,
  isListening = false,
  talkLabel = "Talk to SAARTHI",
}) => {
  const isBusy = isProcessing || isListening;

  return (
    <View style={styles.container}>
      {/* 1. LEFT BUTTON: Stop */}
      <View style={styles.buttonWrapper}>
        <Pressable
          onPress={onStop}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Stop"
          accessibilityHint="Immediately cuts off speech and cancels any active interaction."
          hitSlop={12}
          style={({ pressed }) => [
            styles.circleButton,
            styles.stopButton,
            pressed && styles.stopButtonPressed,
          ]}
        >
          {/* White square stop icon */}
          <View style={styles.stopIcon} />
        </Pressable>
        <Text
          style={styles.buttonLabel}
          maxFontSizeMultiplier={1.8}
          accessibilityRole="text"
        >
          Stop
        </Text>
      </View>

      {/* 2. RIGHT BUTTON: Talk to SAARTHI */}
      <View style={styles.buttonWrapper}>
        <Pressable
          onPress={onTalk}
          disabled={isBusy}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={talkLabel}
          accessibilityHint="Starts listening for your question and captures the camera view to get an AI answer."
          accessibilityState={{ busy: isBusy }}
          hitSlop={12}
          style={({ pressed }) => [
            styles.circleButton,
            styles.talkButton,
            pressed && styles.talkButtonPressed,
            isListening && styles.talkButtonListening,
            isProcessing && styles.talkButtonBusy,
          ]}
        >
          <Ionicons
            name={isListening ? "mic" : "mic-outline"}
            size={36}
            color="#FFFFFF"
            style={styles.micIcon}
          />
        </Pressable>
        <Text
          style={[
            styles.buttonLabel,
            isListening && styles.buttonLabelListening,
          ]}
          maxFontSizeMultiplier={1.8}
          accessibilityRole="text"
        >
          {talkLabel}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 14,
    paddingBottom: 24,
  },
  buttonWrapper: {
    alignItems: "center",
    minWidth: 120,
  },
  circleButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  stopButton: {
    backgroundColor: Colors.stopButton, // #DC2626
    borderWidth: 2.5,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  stopButtonPressed: {
    backgroundColor: Colors.stopButtonHover, // #B91C1C
    transform: [{ scale: 0.94 }],
  },
  stopIcon: {
    width: 24,
    height: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 5,
  },
  talkButton: {
    backgroundColor: Colors.talkButton, // #7C3AED
    borderWidth: 2.5,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  talkButtonPressed: {
    backgroundColor: Colors.talkButtonHover, // #6D28D9
    transform: [{ scale: 0.94 }],
  },
  talkButtonListening: {
    backgroundColor: "#9333EA",
    borderColor: "#C084FC",
    shadowColor: "#A855F7",
    shadowOpacity: 0.8,
    shadowRadius: 16,
  },
  talkButtonBusy: {
    opacity: 0.75,
  },
  micIcon: {
    alignSelf: "center",
  },
  buttonLabel: {
    marginTop: 10,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  buttonLabelListening: {
    color: "#C084FC",
  },
});
