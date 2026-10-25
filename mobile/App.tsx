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
import { hapticsService } from "./src/services/haptics";
import { readingPipeline } from "./src/services/readingPipeline";
import { parseVoiceCommand } from "./src/services/voiceCommands";
import { analyzeSceneWithVision, readCampusText } from "./src/api/client";
import { CampusRouter, CampusGraph, NavigationRoute } from "./src/navigation/campusRouter";
import { CampusLocalizer } from "./src/navigation/localization";
import { CornerControls } from "./src/components/CornerControls";
import sampleCampusData from "./src/data/sample_campus_graph.json";


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

  // Camera readiness
  const [isCameraReady, setIsCameraReady] = useState(false);
  const isCameraReadyRef = useRef(false);

  // State machine & Status displays
  const [assistantState, setAssistantState] = useState<AssistantState>("idle");
  const [statusTitle, setStatusTitle] = useState("SAARTHI Campus Mode");
  const [statusSubtitle, setStatusSubtitle] = useState(
    "Use corner controls or tap Talk to speak commands."
  );

  // Campus navigation & localization state
  const routerRef = useRef<CampusRouter>(new CampusRouter(sampleCampusData as unknown as CampusGraph));
  const localizerRef = useRef<CampusLocalizer>(new CampusLocalizer(sampleCampusData as unknown as CampusGraph));
  const [currentLocationId, setCurrentLocationId] = useState<string>("entrance_main");
  const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);

  // Request & cancellation management
  const isBusyRef = useRef<boolean>(false);
  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCameraReady = useCallback(() => {
    isCameraReadyRef.current = true;
    setIsCameraReady(true);
  }, []);

  const handleCameraMountError = useCallback((error: { message: string }) => {
    isCameraReadyRef.current = false;
    setIsCameraReady(false);
    setAssistantState("error");
    setStatusTitle("Camera Error");
    setStatusSubtitle(`Camera failed to initialize: ${error.message}`);
  }, []);

  // Voice onboarding
  useEffect(() => {
    async function playWelcome() {
      try {
        const played = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!played) {
          const welcome =
            "Welcome to SAARTHI Campus Mode. Fixed corner buttons: Top-left for Where am I, Top-right to Read Text, Bottom-left to Stop or Repeat, and Bottom-right to Talk.";
          await speechService.speak(welcome, { force: true });
          await AsyncStorage.setItem(ONBOARDING_KEY, "true");
        }
      } catch {
        // Safe ignore
      }
    }
    playWelcome();
    AccessibilityInfo.announceForAccessibility("SAARTHI Campus Assistant ready.");
  }, []);

  /**
   * Helper to capture a photo frame safely with timeout and AbortController check.
   */
  const captureFrameBase64 = async (currentRequestId: number): Promise<{ base64: string; uri: string } | null> => {
    if (!isCameraReadyRef.current) {
      const waitStart = Date.now();
      while (!isCameraReadyRef.current && Date.now() - waitStart < 2500) {
        if (requestIdRef.current !== currentRequestId) return null;
        await new Promise((res) => setTimeout(res, 100));
      }
    }

    if (!cameraRef.current) return null;

    try {
      await new Promise((res) => setTimeout(res, 120));
      if (requestIdRef.current !== currentRequestId) return null;

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: false,
      });

      if (!photo) return null;

      let base64 = photo.base64 || "";
      if (!base64 && photo.uri) {
        base64 = await FileSystem.readAsStringAsync(photo.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      return { base64, uri: photo.uri };
    } catch (err) {
      console.warn("[SAARTHI Camera] Capture error:", err);
      return null;
    }
  };

  /**
   * CORNER 1 (TOP-LEFT): Where Am I / Localize via Door Plaque
   */
  const handleWhereAmI = async () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    const currentRequestId = ++requestIdRef.current;

    await speechService.stop();
    setAssistantState("capturing");
    setStatusTitle("Localizing...");
    setStatusSubtitle("Reading nearby door plaques or signs...");
    AccessibilityInfo.announceForAccessibility("Localizing position from door plaque.");

    const photo = await captureFrameBase64(currentRequestId);
    if (!photo || !photo.base64) {
      setAssistantState("error");
      const err = "Could not capture image for localization. Please check camera lens.";
      setStatusTitle("Localization Failed");
      setStatusSubtitle(err);
      await speechService.speak(err, { force: true });
      isBusyRef.current = false;
      return;
    }

    setAssistantState("thinking");
    setStatusSubtitle("Matching sign to campus map...");

    try {
      const res = await readCampusText({
        imageBase64: photo.base64,
        readingMode: "sign",
      });

      if (requestIdRef.current !== currentRequestId) return;

      const signText = res.door_sign?.room_number || res.source_text || "";
      const locResult = localizerRef.current.localizeFromOcr(signText);

      if (locResult.isLocalized && locResult.node) {
        setCurrentLocationId(locResult.node.id);
        setStatusTitle(locResult.node.label);
        setStatusSubtitle(locResult.spokenMessage);
        await speechService.speak(locResult.spokenMessage, { force: true });
      } else {
        const fallbackMsg =
          locResult.spokenMessage ||
          "I see text, but couldn't verify this room on the campus map. Starting from Main Entrance.";
        setStatusTitle("Location Unverified");
        setStatusSubtitle(fallbackMsg);
        await speechService.speak(fallbackMsg, { force: true });
      }

      setAssistantState("idle");
    } catch (err: any) {
      setAssistantState("error");
      const errText = "Could not read door sign. " + (err?.message || "");
      setStatusSubtitle(errText);
      await speechService.speak(errText, { force: true });
    } finally {
      isBusyRef.current = false;
    }
  };

  /**
   * CORNER 2 (TOP-RIGHT): Read Text / Notice / Timetable
   */
  const handleReadText = async () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    const currentRequestId = ++requestIdRef.current;

    await speechService.stop();
    setAssistantState("capturing");
    setStatusTitle("Reading Text...");
    setStatusSubtitle("Scanning timetable, sign, or notice board...");
    AccessibilityInfo.announceForAccessibility("Scanning text in view.");

    const photo = await captureFrameBase64(currentRequestId);
    if (!photo || !photo.base64) {
      setAssistantState("error");
      const err = "Camera capture failed. Please try again.";
      setStatusTitle("Scan Failed");
      setStatusSubtitle(err);
      await speechService.speak(err, { force: true });
      isBusyRef.current = false;
      return;
    }

    setAssistantState("thinking");
    setStatusSubtitle("Structuring campus information with Gemma 4...");

    try {
      const result = await readingPipeline.processCampusImage({
        imageBase64: photo.base64,
        imageUri: photo.uri,
        readingMode: "auto",
      });

      if (requestIdRef.current !== currentRequestId) return;

      setStatusTitle("Text Read");
      setStatusSubtitle(result.spokenText);
      setAssistantState("idle");
    } catch (err: any) {
      setAssistantState("error");
      const errText = err?.message || "I couldn't read that clearly, please try again.";
      setStatusSubtitle(errText);
    } finally {
      isBusyRef.current = false;
    }
  };

  /**
   * CORNER 3 (BOTTOM-LEFT): Stop (tap) & Repeat (long press)
   */
  const handleStop = async () => {
    requestIdRef.current = 0;
    isBusyRef.current = false;

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    voiceRecognitionService.cancelListening();
    await speechService.stop();

    if (activeRoute) {
      routerRef.current.cancelRoute();
      setActiveRoute(null);
    }

    setAssistantState("idle");
    setStatusTitle("Stopped");
    setStatusSubtitle("Assistance cancelled. Ready for your command.");
    AccessibilityInfo.announceForAccessibility("Assistance stopped.");
    await speechService.speak("Stopped.", { force: true });
  };

  const handleRepeat = async () => {
    if (activeRoute) {
      const stepMsg = routerRef.current.repeatCurrentInstruction();
      setStatusSubtitle(stepMsg);
      await speechService.speak(stepMsg, { force: true });
    } else {
      await speechService.repeat();
    }
  };

  /**
   * Navigation handler for "Take me to <place>"
   */
  const handleNavigateTo = async (destinationQuery: string) => {
    await speechService.stop();
    setAssistantState("thinking");
    setStatusTitle("Routing...");
    setStatusSubtitle(`Finding accessible route to "${destinationQuery}"...`);

    const route = routerRef.current.findRoute(currentLocationId, destinationQuery, {
      avoidStairs: true,
    });
    setActiveRoute(route.status === "success" ? route : null);

    setStatusTitle(route.status === "success" ? "Navigation Active" : "Route Notice");
    setStatusSubtitle(route.spokenSummary);
    AccessibilityInfo.announceForAccessibility(route.spokenSummary);
    await speechService.speak(route.spokenSummary, { force: true });
    setAssistantState("idle");
  };

  /**
   * CORNER 4 (BOTTOM-RIGHT): Talk to Saarthi / Push-to-Talk
   */
  const handleTalk = async () => {
    if (isBusyRef.current || assistantState === "listening") return;

    await speechService.stop();

    const voiceStatus = voiceRecognitionService.checkAvailability();
    if (!voiceStatus.available) {
      setAssistantState("error");
      const msg =
        "Voice speech recognition requires an Expo development build. Use corner buttons or fallback test buttons.";
      setStatusTitle("Voice Input Unavailable");
      setStatusSubtitle(msg);
      await speechService.speak(msg, { force: true });
      return;
    }

    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setAssistantState("error");
        const denied = "Camera and microphone permissions are required.";
        setStatusSubtitle(denied);
        await speechService.speak(denied, { force: true });
        return;
      }
    }

    setAssistantState("listening");
    setStatusTitle("Listening...");
    setStatusSubtitle("Speak your question or destination now...");
    await speechService.speak("Listening.", { force: true });

    let finalTranscript = "";

    await voiceRecognitionService.startListening({
      onStart: () => setAssistantState("listening"),
      onResult: (res) => {
        if (res.transcript) setStatusSubtitle(`Hearing: "${res.transcript}"`);
        if (res.isFinal) finalTranscript = res.transcript.trim();
      },
      onError: async (err) => {
        setAssistantState("error");
        setStatusTitle("Voice Error");
        setStatusSubtitle(err);
        await speechService.speak(`Voice recognition error: ${err}`, { force: true });
      },
      onEnd: async () => {
        if (!finalTranscript) {
          setAssistantState("idle");
          setStatusTitle("Ready");
          setStatusSubtitle("No question detected. Tap Talk to try again.");
          await speechService.speak("No question detected. Tap Talk to try again.", { force: true });
          return;
        }

        const command = parseVoiceCommand(finalTranscript);
        console.log(`[SAARTHI Intent] Parsed "${finalTranscript}" -> ${command.intent}`);

        switch (command.intent) {
          case "read_this":
            handleReadText();
            break;
          case "where_am_i":
            handleWhereAmI();
            break;
          case "next_class":
            setStatusTitle("Timetable Query");
            const classRes = await readingPipeline.queryNextClass();
            setStatusSubtitle(classRes.spokenDescription);
            setAssistantState("idle");
            break;
          case "navigate_to":
            if (command.destinationQuery) {
              handleNavigateTo(command.destinationQuery);
            }
            break;
          case "what_is_ahead":
            // Fall back to general visual description
            setAssistantState("capturing");
            const photo = await captureFrameBase64(++requestIdRef.current);
            if (photo?.base64) {
              setAssistantState("thinking");
              const visRes = await analyzeSceneWithVision(photo.base64, "What is ahead in front of me?");
              setStatusTitle("What Is Ahead");
              setStatusSubtitle(visRes.description);
              await speechService.speak(visRes.description, { force: true });
              setAssistantState("idle");
            }
            break;
          case "repeat":
            handleRepeat();
            break;
          case "stop":
            handleStop();
            break;
          case "unknown":
          default:
            setAssistantState("idle");
            const unkMsg = `I heard "${finalTranscript}". You can ask: Read this, Where am I, Next class, What is ahead, or Take me to the library.`;
            setStatusSubtitle(unkMsg);
            await speechService.speak(unkMsg, { force: true });
            break;
        }
      },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Camera Background */}
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
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionDescription}>
            SAARTHI requires camera access to read campus signs and timetables.
          </Text>
          <Pressable
            onPress={requestPermission}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Grant Camera Permission"
            style={styles.enableButton}
          >
            <Text style={styles.enableButtonText}>Enable Camera</Text>
          </Pressable>
        </View>
      )}

      {/* Top Header Bar */}
      <SafeAreaView style={styles.topSafeArea} edges={["top"]} pointerEvents="box-none">
        <View style={styles.topHeader}>
          <Text style={styles.appName} accessibilityRole="header">
            SAARTHI
          </Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {assistantState.toUpperCase()}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Center Status Card & Active Navigation Steps */}
      <View style={styles.centerContainer} pointerEvents="box-none">
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
          <Text style={styles.statusSubtitle} maxFontSizeMultiplier={1.6} numberOfLines={5}>
            {statusSubtitle}
          </Text>

          {/* If navigation is active, provide Advance Step button */}
          {activeRoute && (
            <Pressable
              onPress={() => {
                const step = routerRef.current.advanceStep();
                setStatusSubtitle(step.spokenMessage);
                speechService.speak(step.spokenMessage, { force: true });
                if (step.isFinished) setActiveRoute(null);
              }}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Next Navigation Step"
              style={styles.advanceStepButton}
            >
              <Text style={styles.advanceStepButtonText}>Next Step</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* 4 Fixed Corner Controls with Edge-Gesture Protection */}
      <CornerControls
        onWhereAmI={handleWhereAmI}
        onReadText={handleReadText}
        onStop={handleStop}
        onRepeat={handleRepeat}
        onTalk={handleTalk}
        isListening={assistantState === "listening"}
        isProcessing={assistantState === "capturing" || assistantState === "thinking"}
        isSpeaking={assistantState === "speaking"}
      />
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statusBadgeText: {
    color: "#4ADE80",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  centerContainer: {
    position: "absolute",
    top: "32%",
    left: 20,
    right: 20,
    alignItems: "center",
    zIndex: 5,
  },
  statusCard: {
    width: "100%",
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  statusTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  statusTitleError: {
    color: "#F87171",
  },
  statusTitleListening: {
    color: "#C084FC",
  },
  statusSubtitle: {
    color: "#E2E8F0",
    fontSize: 15,
    lineHeight: 22,
  },
  advanceStepButton: {
    marginTop: 14,
    backgroundColor: "#0284C7",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  advanceStepButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
