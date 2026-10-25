import React from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  AccessibilityInfo,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../theme/colors";
import { hapticsService } from "../services/haptics";

export interface CornerControlsProps {
  onWhereAmI: () => void;
  onReadText: () => void;
  onStop: () => void;
  onRepeat: () => void;
  onTalk: () => void;
  isListening?: boolean;
  isProcessing?: boolean;
  isSpeaking?: boolean;
}

/**
 * 4-Corner Tactile Interface for Saarthi Campus Mode.
 *
 * Designed specifically for visually impaired university students:
 * 1. Fixed spatial corners so users can locate buttons instantly by tactile hand position.
 * 2. Inset by safe-area + 16dp to strictly avoid iOS/Android system edge swipe gesture conflicts.
 * 3. 78dp touch targets with 12dp hitSlop exceeding WCAG AAA requirements.
 * 4. Distinct haptic vibration pattern per corner.
 * 5. Screen reader properties (accessibilityRole, accessibilityLabel, accessibilityHint).
 */
export const CornerControls: React.FC<CornerControlsProps> = ({
  onWhereAmI,
  onReadText,
  onStop,
  onRepeat,
  onTalk,
  isListening = false,
  isProcessing = false,
  isSpeaking = false,
}) => {
  const insets = useSafeAreaInsets();

  // Dynamic inset calculations: add 16dp clearance beyond hardware notches/gesture bars
  const topInset = Math.max(insets.top, 16) + 12;
  const bottomInset = Math.max(insets.bottom, 16) + 12;
  const leftInset = Math.max(insets.left, 16) + 12;
  const rightInset = Math.max(insets.right, 16) + 12;

  const handleWhereAmI = async () => {
    await hapticsService.triggerTopLeft();
    onWhereAmI();
  };

  const handleReadText = async () => {
    await hapticsService.triggerTopRight();
    onReadText();
  };

  const handleStop = async () => {
    await hapticsService.triggerBottomLeft();
    onStop();
  };

  const handleRepeat = async () => {
    await hapticsService.triggerBottomLeft();
    onRepeat();
  };

  const handleTalk = async () => {
    await hapticsService.triggerBottomRight();
    onTalk();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 1. TOP-LEFT: Where Am I */}

      <View
        style={[styles.cornerWrapper, { top: topInset, left: leftInset }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleWhereAmI}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Where am I"
          accessibilityHint="Double tap to scan a door plaque or determine your campus location."
          hitSlop={12}
          style={({ pressed }) => [
            styles.cornerButton,
            styles.topLeftButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="location" size={32} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.buttonLabel} maxFontSizeMultiplier={1.8}>
          Where Am I
        </Text>
      </View>

      {/* 2. TOP-RIGHT: Read Text / Notice */}
      <View
        style={[styles.cornerWrapper, { top: topInset, right: rightInset }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleReadText}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Read Text"
          accessibilityHint="Double tap to read timetables, door signs, or notice boards in front of the camera."
          hitSlop={12}
          style={({ pressed }) => [
            styles.cornerButton,
            styles.topRightButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="document-text" size={32} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.buttonLabel} maxFontSizeMultiplier={1.8}>
          Read Text
        </Text>
      </View>

      {/* 3. BOTTOM-LEFT: Stop & Repeat */}
      <View
        style={[styles.cornerWrapper, { bottom: bottomInset, left: leftInset }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleStop}
          onLongPress={handleRepeat}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Stop speech. Long press to repeat last answer."
          accessibilityHint="Tap once to silence speech immediately. Press and hold to hear the previous message again."
          hitSlop={12}
          style={({ pressed }) => [
            styles.cornerButton,
            styles.bottomLeftButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <View style={styles.stopIcon} />
        </Pressable>
        <Text style={styles.buttonLabel} maxFontSizeMultiplier={1.8}>
          Stop / Repeat
        </Text>
      </View>

      {/* 4. BOTTOM-RIGHT: Talk to Saarthi */}
      <View
        style={[styles.cornerWrapper, { bottom: bottomInset, right: rightInset }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleTalk}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={isListening ? "Listening to your question" : "Talk to Saarthi"}
          accessibilityHint="Double tap to ask a question, request directions, or ask about your next class."
          accessibilityState={{ busy: isProcessing || isListening }}
          hitSlop={12}
          style={({ pressed }) => [
            styles.cornerButton,
            styles.bottomRightButton,
            pressed && styles.buttonPressed,
            isListening && styles.listeningButton,
          ]}
        >
          <Ionicons
            name={isListening ? "mic" : "mic-outline"}
            size={36}
            color="#FFFFFF"
          />
        </Pressable>
        <Text
          style={[
            styles.buttonLabel,
            isListening && styles.listeningText,
          ]}
          maxFontSizeMultiplier={1.8}
        >
          {isListening ? "Listening..." : "Talk"}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cornerWrapper: {
    position: "absolute",
    alignItems: "center",
    width: 100,
  },
  cornerButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 9,
    borderWidth: 2.5,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  buttonPressed: {
    transform: [{ scale: 0.94 }],
  },
  topLeftButton: {
    backgroundColor: "#0284C7", // High-contrast Accessible Blue
  },
  topRightButton: {
    backgroundColor: "#059669", // High-contrast Accessible Emerald
  },
  bottomLeftButton: {
    backgroundColor: "#DC2626", // High-contrast Accessible Red
  },
  bottomRightButton: {
    backgroundColor: "#7C3AED", // High-contrast Accessible Purple
  },
  listeningButton: {
    backgroundColor: "#9333EA",
    borderColor: "#FACC15",
    borderWidth: 3.5,
    shadowColor: "#FACC15",
    shadowOpacity: 0.9,
    shadowRadius: 16,
  },
  stopIcon: {
    width: 26,
    height: 26,
    backgroundColor: "#FFFFFF",
    borderRadius: 5,
  },
  buttonLabel: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 3,
  },
  listeningText: {
    color: "#FACC15",
  },
});
