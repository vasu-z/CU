import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  AccessibilityInfo,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../theme/colors";
import { speechService } from "../services/speech";
import { hapticsService } from "../services/haptics";
import { readingPipeline, ReadingPipelineResult } from "../services/readingPipeline";

export type ReadingMode = "auto" | "timetable" | "sign" | "notice";

export interface CampusReaderScreenProps {
  initialMode?: ReadingMode;
  onNavigateBack: () => void;
  onReadingComplete: (result: ReadingPipelineResult, mode: ReadingMode, imageUri?: string) => void;
}

export const CampusReaderScreen: React.FC<CampusReaderScreenProps> = ({
  initialMode = "auto",
  onNavigateBack,
  onReadingComplete,
}) => {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [readingMode, setReadingMode] = useState<ReadingMode>(initialMode);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [processingStage, setProcessingStage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);

  const modeDescriptions: Record<ReadingMode, string> = {
    auto: "General Text mode: Reads printed documents, textbook pages, and signs.",
    timetable: "Timetable mode: Extracts course schedules, class times, and classroom numbers.",
    sign: "Room Sign mode: Reads door plaques, department names, and office hours.",
    notice: "Notice mode: Summarizes university announcements, dates, and assignment deadlines.",
  };

  const handleSelectMode = async (mode: ReadingMode) => {
    await hapticsService.triggerButtonPress();
    setReadingMode(mode);
    setErrorMessage(null);
    const desc = modeDescriptions[mode];
    await speechService.speak(desc, { force: true });
  };

  const handleCapture = async () => {
    if (isCapturing) return;

    if (!permission?.granted) {
      await speechService.speak("Camera permission is required to take a scan.", { force: true });
      return;
    }

    if (!cameraRef.current) {
      await speechService.speak("Camera is initializing, please wait a moment.", { force: true });
      return;
    }

    try {
      setIsCapturing(true);
      setErrorMessage(null);
      setProcessingStage("Capturing photo...");
      await hapticsService.triggerCapture();

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.85,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        throw new Error("Camera did not return a valid photo.");
      }

      setProcessingStage("Analyzing with on-device OCR & Gemma 4...");
      await speechService.speak("Image captured. Analyzing campus text...", { force: true });

      // Process through full reading pipeline
      const result = await readingPipeline.processCampusImage({
        imageUri: photo.uri,
        imageBase64: photo.base64,
        readingMode: readingMode,
      });

      setIsCapturing(false);
      setProcessingStage("");
      onReadingComplete(result, readingMode, photo.uri);
    } catch (err: any) {
      setIsCapturing(false);
      setProcessingStage("");
      const msg =
        err?.message ||
        "I couldn't read that clearly. Please ensure good lighting, hold the phone steady, and scan again.";
      setErrorMessage(msg);
      await speechService.speak(msg, { force: true });
    }
  };

  const handleStop = async () => {
    await hapticsService.triggerBottomLeft();
    await speechService.stop();
  };

  const handleRepeat = async () => {
    await hapticsService.triggerBottomLeft();
    await speechService.repeatLast();
  };

  // If permission not granted
  if (!permission?.granted) {
    return (
      <View style={styles.permissionContainer} accessible={true} accessibilityRole="alert">
        <Ionicons name="camera-outline" size={64} color={Colors.primary} />
        <Text style={styles.permissionTitle} accessibilityRole="header">
          Camera Permission Needed
        </Text>
        <Text style={styles.permissionDescription}>
          SAARTHI uses your camera to read room signs, timetables, and campus bulletin boards.
          Your photos are processed strictly for reading assistance and are never permanently stored.
        </Text>
        <Pressable
          onPress={requestPermission}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Grant Camera Access"
          style={styles.permissionButton}
        >
          <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
        </Pressable>
        <Pressable
          onPress={onNavigateBack}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Go back to Home"
          style={styles.permissionCancelButton}
        >
          <Text style={styles.permissionCancelButtonText}>Cancel & Return to Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 1. Live Camera Preview */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        onCameraReady={() => setIsCameraReady(true)}
      />

      {/* 2. Top Header & Navigation Bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={onNavigateBack}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Back to Home Screen"
          style={styles.topBarButton}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          <Text style={styles.topBarButtonText}>Back</Text>
        </Pressable>

        <View style={styles.modeIndicatorBadge}>
          <Text style={styles.modeIndicatorText}>
            {readingMode === "auto"
              ? "General Text"
              : readingMode === "timetable"
              ? "Timetable"
              : readingMode === "sign"
              ? "Room Sign"
              : "Notice"}
          </Text>
        </View>

        <Pressable
          onPress={handleStop}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Stop active audio speech"
          style={styles.topBarStopButton}
        >
          <Ionicons name="stop" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* 3. Error Recovery Card (if scan failed) */}
      {errorMessage && (
        <View style={styles.errorOverlayCard} accessible={true} accessibilityRole="alert">
          <View style={styles.errorHeaderRow}>
            <Ionicons name="alert-circle" size={24} color={Colors.error} />
            <Text style={styles.errorTitle}>Scan Incomplete</Text>
          </View>
          <Text style={styles.errorBody}>{errorMessage}</Text>
          <View style={styles.errorButtonsRow}>
            <Pressable
              onPress={() => setErrorMessage(null)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error and try scanning again"
              style={styles.errorDismissButton}
            >
              <Text style={styles.errorDismissButtonText}>Scan Again</Text>
            </Pressable>
            <Pressable
              onPress={handleRepeat}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Repeat the error explanation"
              style={styles.errorRepeatButton}
            >
              <Text style={styles.errorRepeatButtonText}>Hear Reason</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 4. Processing Overlay */}
      {isCapturing && (
        <View style={styles.loadingOverlay} accessible={true} accessibilityRole="progressbar">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingTitle}>Reading Campus Text</Text>
            <Text style={styles.loadingSubtitle}>{processingStage}</Text>
          </View>
        </View>
      )}

      {/* 5. Bottom Controls Container */}
      <View style={styles.bottomControls}>
        {/* Mode Selector Tabs */}
        <View
          style={styles.modeTabsRow}
          accessible={true}
          accessibilityRole="tablist"
          accessibilityLabel="Select Reading Mode"
        >
          <Pressable
            onPress={() => handleSelectMode("auto")}
            accessible={true}
            accessibilityRole="tab"
            accessibilityLabel="General Text Mode. Reads standard documents and printed text."
            accessibilityState={{ selected: readingMode === "auto" }}
            style={[styles.modeTab, readingMode === "auto" && styles.modeTabActive]}
          >
            <Text style={[styles.modeTabText, readingMode === "auto" && styles.modeTabTextActive]}>
              General
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handleSelectMode("sign")}
            accessible={true}
            accessibilityRole="tab"
            accessibilityLabel="Room Sign Mode. Reads classroom door plaques and office labels."
            accessibilityState={{ selected: readingMode === "sign" }}
            style={[styles.modeTab, readingMode === "sign" && styles.modeTabActive]}
          >
            <Text style={[styles.modeTabText, readingMode === "sign" && styles.modeTabTextActive]}>
              Door Sign
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handleSelectMode("timetable")}
            accessible={true}
            accessibilityRole="tab"
            accessibilityLabel="Timetable Mode. Extracts courses, class times, and room numbers."
            accessibilityState={{ selected: readingMode === "timetable" }}
            style={[styles.modeTab, readingMode === "timetable" && styles.modeTabActive]}
          >
            <Text
              style={[
                styles.modeTabText,
                readingMode === "timetable" && styles.modeTabTextActive,
              ]}
            >
              Timetable
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handleSelectMode("notice")}
            accessible={true}
            accessibilityRole="tab"
            accessibilityLabel="Notice Mode. Summarizes campus bulletins and deadlines."
            accessibilityState={{ selected: readingMode === "notice" }}
            style={[styles.modeTab, readingMode === "notice" && styles.modeTabActive]}
          >
            <Text
              style={[
                styles.modeTabText,
                readingMode === "notice" && styles.modeTabTextActive,
              ]}
            >
              Notice
            </Text>
          </Pressable>
        </View>

        {/* Capture Shutter Button */}
        <View style={styles.captureButtonContainer}>
          <Pressable
            onPress={handleCapture}
            disabled={isCapturing}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Capture photo and read text"
            accessibilityHint="Takes a photo and starts AI text analysis"
            style={({ pressed }) => [
              styles.captureButton,
              pressed && styles.captureButtonPressed,
              isCapturing && styles.captureButtonDisabled,
            ]}
          >
            <View style={styles.captureInnerCircle}>
              <Ionicons name="camera" size={36} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>

        <Text style={styles.captureHintText}>
          Hold phone steady and tap the button to capture
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginTop: 20,
    marginBottom: 12,
    textAlign: "center",
  },
  permissionDescription: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  permissionButton: {
    width: "100%",
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    minHeight: 56,
    justifyContent: "center",
    marginBottom: 12,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  permissionCancelButton: {
    width: "100%",
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  permissionCancelButtonText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  topBar: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  topBarButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    minHeight: 48,
  },
  topBarButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  modeIndicatorBadge: {
    backgroundColor: "rgba(30, 58, 138, 0.9)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  modeIndicatorText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  topBarStopButton: {
    backgroundColor: Colors.stopButton,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  errorOverlayCard: {
    position: "absolute",
    top: 120,
    left: 20,
    right: 20,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.error,
    borderRadius: 14,
    padding: 18,
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  errorHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: Colors.error,
  },
  errorBody: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 14,
  },
  errorButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  errorDismissButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  errorDismissButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  errorRepeatButton: {
    flex: 1,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  errorRepeatButtonText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    padding: 24,
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 28,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginTop: 16,
    marginBottom: 6,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  bottomControls: {
    position: "absolute",
    bottom: 30,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  modeTabsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderRadius: 24,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  modeTab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    minHeight: 40,
    justifyContent: "center",
  },
  modeTabActive: {
    backgroundColor: Colors.primary,
  },
  modeTabText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },
  modeTabTextActive: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  captureButtonContainer: {
    alignItems: "center",
    marginBottom: 10,
  },
  captureButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  captureButtonPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureInnerCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  captureHintText: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
