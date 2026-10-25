import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  AccessibilityInfo,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Colors } from "./src/theme/colors";
import { speechService } from "./src/services/speech";
import { voiceRecognitionService } from "./src/services/voiceRecognition";
import { analyzeSceneWithVision } from "./src/api/client";
import { HomeControls } from "./src/components/HomeControls";

export type AssistantState =
  | "idle"
  | "listening"
  | "capturing"
  | "thinking"
  | "speaking"
  | "error";

const ONBOARDING_KEY = "@saarthi_welcome_played";

export default function App() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // Camera readiness tracking
  const [isCameraReady, setIsCameraReady] = useState(false);
  const isCameraReadyRef = useRef(false);

  // Assistant State Machine
  const [assistantState, setAssistantState] = useState<AssistantState>("idle");
  const [statusTitle, setStatusTitle] = useState("Ready");
  const [statusSubtitle, setStatusSubtitle] = useState(
    "Point your camera at what you want to know about."
  );

  // Concurrency, race-condition and cancellation management
  const isBusyRef = useRef<boolean>(false);
  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --------------------------------------------------------------------------
  // Camera Event Handlers
  // --------------------------------------------------------------------------
  const handleCameraReady = useCallback(() => {
    console.log("[SAARTHI Camera] onCameraReady event fired.");
    isCameraReadyRef.current = true;
    setIsCameraReady(true);
  }, []);

  const handleCameraMountError = useCallback((error: { message: string }) => {
    console.error("[SAARTHI Camera] onMountError:", error.message);
    isCameraReadyRef.current = false;
    setIsCameraReady(false);
    setAssistantState("error");
    setStatusTitle("Camera Error");
    setStatusSubtitle(`Camera failed to initialize: ${error.message}`);
  }, []);

  // --------------------------------------------------------------------------
  // Voice-first Onboarding Announcement (Exact Required Wording)
  // --------------------------------------------------------------------------
  useEffect(() => {
    async function playWelcome() {
      try {
        const played = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!played) {
          const welcome =
            "Welcome to SAARTHI. To talk to me, tap the button in the bottom-right corner of the screen, then ask your question.";
          await speechService.speak(welcome, { force: true });
          await AsyncStorage.setItem(ONBOARDING_KEY, "true");
        }
      } catch {
        // Safe fallback
      }
    }

    playWelcome();
    AccessibilityInfo.announceForAccessibility("SAARTHI visual assistant is ready.");
  }, []);

  // --------------------------------------------------------------------------
  // Core Pipeline: Capture Camera Frame & Query Backend Gemini Vision
  // --------------------------------------------------------------------------
  const processQuestionAndCapture = async (
    promptText: string,
    isVoiceQuestion: boolean = true
  ) => {
    // Prevent overlapping capture and analysis
    if (isBusyRef.current) {
      console.log("[SAARTHI Pipeline] Analysis already in progress, ignoring call.");
      return;
    }

    isBusyRef.current = true;
    const currentRequestId = ++requestIdRef.current;

    // Reset previous abort controller and create a new one for this request
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    console.log(
      `[SAARTHI Pipeline] Initiating pipeline (req #${currentRequestId}): isVoice=${isVoiceQuestion}, prompt="${promptText}"`
    );

    // 1. Transition state to "capturing"
    setAssistantState("capturing");
    setStatusTitle(isVoiceQuestion ? "Capturing..." : "Camera & Vision Test");
    setStatusSubtitle(
      isVoiceQuestion
        ? `Question: "${promptText}"`
        : "Capturing camera frame for scene description..."
    );
    AccessibilityInfo.announceForAccessibility(
      isVoiceQuestion
        ? "Capturing camera view."
        : "Capturing camera frame for scene description test."
    );

    // Ensure camera readiness before capture
    if (!isCameraReadyRef.current) {
      console.log("[SAARTHI Camera] Waiting for onCameraReady before capture...");
      const waitStart = Date.now();
      while (!isCameraReadyRef.current && Date.now() - waitStart < 2500) {
        if (requestIdRef.current !== currentRequestId) {
          isBusyRef.current = false;
          return;
        }
        await new Promise((res) => setTimeout(res, 100));
      }
      console.log(`[SAARTHI Camera] Wait completed. isReady=${isCameraReadyRef.current}`);
    }

    if (!cameraRef.current) {
      if (requestIdRef.current !== currentRequestId) {
        isBusyRef.current = false;
        return;
      }
      setAssistantState("error");
      const errMsg = "Camera is not ready. Please ensure camera access is granted.";
      setStatusTitle("Camera Unavailable");
      setStatusSubtitle(errMsg);
      AccessibilityInfo.announceForAccessibility(errMsg);
      speechService.speak(errMsg, { force: true });
      isBusyRef.current = false;
      return;
    }

    let base64Image = "";
    try {
      // 150ms buffer to stabilize native AVCaptureSession on iOS
      await new Promise((res) => setTimeout(res, 150));

      if (requestIdRef.current !== currentRequestId) {
        isBusyRef.current = false;
        return;
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: false,
      });

      console.log(
        `[SAARTHI Camera] Photo captured: width=${photo?.width}, height=${photo?.height}, hasBase64=${!!photo?.base64}, hasUri=${!!photo?.uri}`
      );

      if (photo?.base64) {
        base64Image = photo.base64;
      } else if (photo?.uri) {
        console.log("[SAARTHI Camera] Reading base64 from file URI:", photo.uri);
        base64Image = await FileSystem.readAsStringAsync(photo.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
    } catch (camErr: any) {
      console.error("[SAARTHI Camera] takePictureAsync error:", camErr);
    }

    // Check if Stop was tapped while camera was capturing
    if (requestIdRef.current !== currentRequestId) {
      console.log("[SAARTHI] Interaction was cancelled during camera capture.");
      isBusyRef.current = false;
      return;
    }

    if (!base64Image) {
      setAssistantState("error");
      const errMsg =
        "Unable to capture image from camera. Please ensure camera lens is unobstructed.";
      setStatusTitle("Capture Failed");
      setStatusSubtitle(errMsg);
      AccessibilityInfo.announceForAccessibility(errMsg);
      speechService.speak(errMsg, { force: true });
      isBusyRef.current = false;
      return;
    }

    // 2. Transition state to "thinking"
    setAssistantState("thinking");
    setStatusTitle(isVoiceQuestion ? "Thinking..." : "Analyzing Scene...");
    setStatusSubtitle(
      isVoiceQuestion
        ? "Consulting Gemini AI..."
        : "Analyzing camera scene with Gemini AI..."
    );
    AccessibilityInfo.announceForAccessibility(
      isVoiceQuestion ? "Consulting Gemini AI." : "Analyzing scene with Gemini AI."
    );

    try {
      const startTime = Date.now();
      const visionResult = await analyzeSceneWithVision(
        base64Image,
        promptText,
        "image/jpeg",
        abortController.signal
      );
      const elapsed = Date.now() - startTime;
      console.log(
        `[SAARTHI Vision] Response received in ${elapsed}ms: "${visionResult.description}"`
      );

      // Check if Stop was tapped while Gemini was computing
      if (requestIdRef.current !== currentRequestId) {
        console.log("[SAARTHI] Discarding late AI response because interaction was cancelled.");
        isBusyRef.current = false;
        return;
      }

      const rawAnswer = visionResult.description?.trim();
      if (!rawAnswer) {
        throw new Error("Received an empty description from Gemini.");
      }

      // 3. Transition state to "speaking"
      setAssistantState("speaking");
      setStatusTitle("SAARTHI");
      setStatusSubtitle(rawAnswer);
      AccessibilityInfo.announceForAccessibility("Answer received.");

      // Speak the real answer aloud using the text-to-speech service
      await speechService.speak(rawAnswer, {
        force: true,
        onDone: () => {
          if (requestIdRef.current === currentRequestId) {
            console.log("[SAARTHI Speech] Speech finished. Returning to ready.");
            setAssistantState("idle");
            setStatusTitle("Ready");
            setStatusSubtitle("Point your camera at what you want to know about.");
            isBusyRef.current = false;
          }
        },
        onError: (err) => {
          console.warn("[SAARTHI Speech] Speech playback error:", err);
          if (requestIdRef.current === currentRequestId) {
            setAssistantState("idle");
            isBusyRef.current = false;
          }
        },
      });
    } catch (err: any) {
      if (err.name === "AbortError" || requestIdRef.current !== currentRequestId) {
        console.log("[SAARTHI Vision] Request cancelled by user.");
        isBusyRef.current = false;
        return;
      }

      setAssistantState("error");
      const errMsg =
        err?.message || "Failed to analyze scene. Please check your backend connection.";
      console.error("[SAARTHI Vision] Error during analysis:", errMsg);
      setStatusTitle("Analysis Failed");
      setStatusSubtitle(errMsg);
      AccessibilityInfo.announceForAccessibility(`Error: ${errMsg}`);
      speechService.speak(`Analysis failed. ${errMsg}`, { force: true });
      isBusyRef.current = false;
    }
  };

  // --------------------------------------------------------------------------
  // Primary Control: Stop
  // --------------------------------------------------------------------------
  const handleStop = async () => {
    console.log("[SAARTHI] Stop button tapped by user.");

    // Check if there is an active interaction to stop
    const isSpeaking = await speechService.isSpeakingAsync();
    const hadActiveInteraction =
      assistantState !== "idle" ||
      isBusyRef.current ||
      isSpeaking ||
      voiceRecognitionService.getIsListening() ||
      requestIdRef.current > 0;

    requestIdRef.current = 0; // Invalidate all pending request identifiers
    isBusyRef.current = false;

    // Abort in-flight network request
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // Cancel active listening and cut off speech playback immediately
    voiceRecognitionService.cancelListening();
    await speechService.stop();

    setAssistantState("idle");
    setStatusTitle("Ready");
    setStatusSubtitle("Point your camera at what you want to know about.");

    // Ensure Stop only announces "Stopped" when there was an active interaction to stop.
    // When already idle, it should not start unnecessary speech.
    if (hadActiveInteraction) {
      AccessibilityInfo.announceForAccessibility("Assistance stopped.");
      speechService.speak("Stopped.", { force: true });
    } else {
      console.log("[SAARTHI] App is already idle, no active interaction to stop.");
    }
  };

  // --------------------------------------------------------------------------
  // Primary Control: Talk to SAARTHI (in bottom-right corner)
  // --------------------------------------------------------------------------
  const handleTalk = async () => {
    // Prevent duplicate triggers if already busy
    if (isBusyRef.current || assistantState === "listening") {
      console.log("[SAARTHI] Talk tapped while busy, ignoring duplicate tap.");
      return;
    }

    console.log("[SAARTHI] Talk to SAARTHI tapped.");

    // Cut off any active speech playback
    await speechService.stop();

    // Check speech recognition capability
    const voiceStatus = voiceRecognitionService.checkAvailability();
    if (!voiceStatus.available) {
      console.log("[SAARTHI Voice] Speech recognition unavailable:", voiceStatus.reason);
      setAssistantState("error");
      setStatusTitle("Speech Recognition Unavailable");
      setStatusSubtitle(
        "Speech recognition requires an Expo development build (not supported in Expo Go). Tap 'Test Camera & Scene Description' below to test visual analysis."
      );
      AccessibilityInfo.announceForAccessibility(
        "Speech recognition is not available in Expo Go. A development build is required."
      );
      // Give a clear spoken explanation and stop that interaction immediately
      await speechService.speak(
        "Speech recognition is not available in Expo Go. A development build is required for voice input.",
        { force: true }
      );
      return;
    }

    // Verify camera permission
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setAssistantState("error");
        const deniedMsg =
          "Camera permission is required for SAARTHI to see your surroundings. Please enable it in Settings.";
        setStatusTitle("Camera Access Needed");
        setStatusSubtitle(deniedMsg);
        AccessibilityInfo.announceForAccessibility(deniedMsg);
        speechService.speak(deniedMsg, { force: true });
        return;
      }
    }

    // Speech recognition IS available (e.g. running in development build)
    setAssistantState("listening");
    setStatusTitle("Listening...");
    setStatusSubtitle("Ask your question aloud now...");
    AccessibilityInfo.announceForAccessibility("Listening. Ask your question now.");
    speechService.speak("Listening.", { force: true });

    let hasError = false;
    let finalQuestion = "";

    await voiceRecognitionService.startListening({
      onStart: () => {
        setAssistantState("listening");
      },
      onResult: (result) => {
        if (result.transcript) {
          setStatusSubtitle(`Hearing: "${result.transcript}"`);
        }
        if (result.isFinal) {
          finalQuestion = result.transcript.trim();
        }
      },
      onError: (err) => {
        hasError = true;
        console.warn("[SAARTHI Voice] Recognition error:", err);
        setAssistantState("error");
        setStatusTitle("Speech Recognition Error");
        setStatusSubtitle(err);
        AccessibilityInfo.announceForAccessibility(`Voice error: ${err}`);
        speechService.speak(`Voice recognition error: ${err}`, { force: true });
      },
      onEnd: () => {
        if (hasError) {
          console.log("[SAARTHI Voice] Recognition ended after error, skipping capture.");
          return;
        }
        console.log(`[SAARTHI Voice] Recognition ended with text: "${finalQuestion}"`);
        if (!finalQuestion || !finalQuestion.trim()) {
          setAssistantState("idle");
          setStatusTitle("Ready");
          setStatusSubtitle("No question detected. Tap Talk to SAARTHI to try again.");
          AccessibilityInfo.announceForAccessibility("No question detected.");
          speechService.speak("No question was detected. Tap Talk to try again.", {
            force: true,
          });
          return;
        }

        // Proceed to capture and query AI with user's real spoken question
        processQuestionAndCapture(finalQuestion, true);
      },
    });
  };

  // --------------------------------------------------------------------------
  // Separately Labelled Fallback Control (for testing in Expo Go)
  // --------------------------------------------------------------------------
  const handleDirectCameraTest = () => {
    console.log(
      "[SAARTHI] Fallback control explicitly tapped: Test Camera & Scene Description"
    );
    processQuestionAndCapture(
      "Describe what is in front of the camera clearly, noting immediate objects and visible obstacles.",
      false
    );
  };

  // --------------------------------------------------------------------------
  // Determine Status Badge Color & Text
  // --------------------------------------------------------------------------
  const getStatusBadge = () => {
    switch (assistantState) {
      case "listening":
        return { label: "LISTENING", dotColor: "#C084FC", bgColor: "rgba(192, 132, 252, 0.2)" };
      case "capturing":
        return { label: "CAPTURING", dotColor: "#38BDF8", bgColor: "rgba(56, 189, 248, 0.2)" };
      case "thinking":
        return { label: "THINKING", dotColor: "#A855F7", bgColor: "rgba(168, 85, 247, 0.2)" };
      case "speaking":
        return { label: "SPEAKING", dotColor: "#22C55E", bgColor: "rgba(34, 197, 94, 0.2)" };
      case "error":
        return { label: "ATTENTION", dotColor: "#F87171", bgColor: "rgba(248, 113, 113, 0.2)" };
      case "idle":
      default:
        return {
          label: isCameraReady ? "READY" : "STARTING",
          dotColor: isCameraReady ? "#4ADE80" : "#FACC15",
          bgColor: isCameraReady ? "rgba(74, 222, 128, 0.2)" : "rgba(250, 204, 21, 0.2)",
        };
    }
  };

  const badge = getStatusBadge();
  const isBusy =
    assistantState === "capturing" ||
    assistantState === "thinking" ||
    assistantState === "speaking";

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* ============================================================== */}
      {/* 1. Main Area: Live Rear Camera Preview                         */}
      {/* ============================================================== */}
      {permission?.granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          onCameraReady={handleCameraReady}
          onMountError={handleCameraMountError}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.permissionContainer]}>
          <Text style={styles.permissionTitle} maxFontSizeMultiplier={2.0}>
            Camera Inactive
          </Text>
          <Text style={styles.permissionDescription} maxFontSizeMultiplier={1.8}>
            {permission
              ? "SAARTHI requires camera access to describe your surroundings and identify obstacles."
              : "Checking camera permission..."}
          </Text>
          {permission && !permission.granted && (
            <Pressable
              onPress={requestPermission}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Enable Camera Access"
              accessibilityHint="Prompts to allow camera permissions so SAARTHI can see."
              style={({ pressed }) => [
                styles.enableButton,
                pressed && styles.enableButtonPressed,
              ]}
            >
              <Text style={styles.enableButtonText} maxFontSizeMultiplier={1.8}>
                Enable Camera Access
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* 2. Top Header: App Name & Unobtrusive Status Indicator         */}
      {/* ============================================================== */}
      <SafeAreaView style={styles.topSafeArea} edges={["top"]}>
        <View style={styles.topHeader}>
          <Text
            style={styles.appName}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.6}
          >
            SAARTHI
          </Text>

          {/* Small, unobtrusive status indicator */}
          <View
            style={[styles.statusBadge, { backgroundColor: badge.bgColor }]}
            accessible={true}
            accessibilityRole="text"
            accessibilityLabel={`Assistant status: ${badge.label}`}
          >
            <View
              style={[styles.statusDot, { backgroundColor: badge.dotColor }]}
            />
            <Text
              style={[styles.statusBadgeText, { color: badge.dotColor }]}
              maxFontSizeMultiplier={1.4}
            >
              {badge.label}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ============================================================== */}
      {/* 3. Main Area Overlay: Instructional Guidance                   */}
      {/* ============================================================== */}
      {assistantState === "idle" && (
        <View style={styles.instructionContainer} pointerEvents="none">
          <Text
            style={styles.instructionText}
            maxFontSizeMultiplier={1.8}
            accessibilityRole="text"
          >
            Point your camera at what you want to know about.
          </Text>
        </View>
      )}

      {/* ============================================================== */}
      {/* 4. Bottom Area: Status Message & Two Primary Controls          */}
      {/* ============================================================== */}
      <View style={styles.bottomOverlay}>
        {/* Concise Status Message Card */}
        <View
          style={styles.statusCard}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={`${statusTitle}. ${statusSubtitle}`}
        >
          <Text
            style={[
              styles.statusTitle,
              assistantState === "error" && styles.statusTitleError,
              assistantState === "listening" && styles.statusTitleListening,
            ]}
            maxFontSizeMultiplier={1.8}
          >
            {statusTitle}
          </Text>
          <Text
            style={styles.statusSubtitle}
            maxFontSizeMultiplier={1.6}
            numberOfLines={4}
          >
            {statusSubtitle}
          </Text>

          {/* Clearly Communicated Fallback Button (for Expo Go Testing) */}
          {assistantState === "error" &&
            statusTitle.includes("Speech Recognition") && (
              <Pressable
                onPress={handleDirectCameraTest}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Test Camera & Scene Description"
                accessibilityHint="Captures a photo and describes the scene with Gemini AI without requiring voice input."
                style={({ pressed }) => [
                  styles.testCaptureButton,
                  pressed && styles.testCaptureButtonPressed,
                ]}
              >
                <Text
                  style={styles.testCaptureButtonText}
                  maxFontSizeMultiplier={1.6}
                >
                  Test Camera & Scene Description
                </Text>
              </Pressable>
            )}
        </View>

        {/* Exactly TWO Primary Buttons: Stop (bottom-left) & Talk to SAARTHI (bottom-right) */}
        <HomeControls
          onStop={handleStop}
          onTalk={handleTalk}
          isProcessing={isBusy}
          isListening={assistantState === "listening"}
          talkLabel={
            assistantState === "listening" ? "Listening..." : "Talk to SAARTHI"
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  permissionContainer: {
    backgroundColor: "#0B0E14",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  permissionTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  permissionDescription: {
    color: "#94A3B8",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  enableButton: {
    backgroundColor: Colors.talkButton,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  enableButtonPressed: {
    backgroundColor: Colors.talkButtonHover,
    transform: [{ scale: 0.96 }],
  },
  enableButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  topSafeArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 10 : 6,
    paddingBottom: 12,
  },
  appName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  instructionContainer: {
    position: "absolute",
    top: "35%",
    left: 24,
    right: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 9, 13, 0.65)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  instructionText: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
  },
  bottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingBottom: Platform.OS === "ios" ? 16 : 24,
  },
  statusCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "rgba(18, 22, 33, 0.92)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  statusTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  statusTitleError: {
    color: "#F87171",
  },
  statusTitleListening: {
    color: "#C084FC",
  },
  statusSubtitle: {
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 21,
  },
  testCaptureButton: {
    marginTop: 12,
    backgroundColor: Colors.talkButton,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  testCaptureButtonPressed: {
    backgroundColor: Colors.talkButtonHover,
  },
  testCaptureButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
