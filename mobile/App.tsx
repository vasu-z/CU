import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  AccessibilityInfo,
  Platform,
  Modal,
  TextInput,
  ScrollView,
  Switch,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
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
import {
  analyzeSceneWithVision,
  readCampusText,
  checkBackendHealth,
  setCustomApiBaseUrl,
  getApiBaseUrl,
} from "./src/api/client";
import {
  CampusRouter,
  CampusGraph,
  CampusNode,
  NavigationRoute,
} from "./src/navigation/campusRouter";
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
const BACKEND_URL_KEY = "@saarthi_backend_url";

export function SaarthiApp() {
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
  const routerRef = useRef<CampusRouter>(
    new CampusRouter(sampleCampusData as unknown as CampusGraph)
  );
  const localizerRef = useRef<CampusLocalizer>(
    new CampusLocalizer(sampleCampusData as unknown as CampusGraph)
  );

  const [currentLocationId, setCurrentLocationId] = useState<string>("entrance_main");
  const [isLocationVerified, setIsLocationVerified] = useState<boolean>(true);
  const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
  const [avoidStairs, setAvoidStairs] = useState<boolean>(true);

  // Modals
  const [isNavModalOpen, setIsNavModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [destinationSearch, setDestinationSearch] = useState("");
  const [backendUrlInput, setBackendUrlInput] = useState(getApiBaseUrl());

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

  // Onboarding & initialization
  useEffect(() => {
    async function initApp() {
      try {
        const savedUrl = await AsyncStorage.getItem(BACKEND_URL_KEY);
        if (savedUrl) {
          setCustomApiBaseUrl(savedUrl);
          setBackendUrlInput(savedUrl);
        }

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
    initApp();
    AccessibilityInfo.announceForAccessibility("SAARTHI Campus Assistant ready.");
  }, []);

  /**
   * Helper to capture a photo frame safely with timeout and AbortController check.
   */
  const captureFrameBase64 = async (
    currentRequestId: number
  ): Promise<{ base64: string; uri: string } | null> => {
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
        setIsLocationVerified(true);
        setStatusTitle(locResult.node.label);
        setStatusSubtitle(locResult.spokenMessage);
        await speechService.speak(locResult.spokenMessage, { force: true });
      } else {
        setIsLocationVerified(false);
        const fallbackMsg =
          locResult.spokenMessage ||
          "I see text, but couldn't verify this room on the campus map. Please select a known starting point.";
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
  const handleReadText = async (
    mode: "auto" | "timetable" | "sign" | "notice" | "surroundings" = "auto"
  ) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    const currentRequestId = ++requestIdRef.current;

    await speechService.stop();
    setAssistantState("capturing");

    const modeLabels: Record<string, string> = {
      timetable: "Scanning Timetable...",
      sign: "Reading Room Number...",
      notice: "Summarizing Notice...",
      surroundings: "Describing Surroundings...",
      auto: "Reading Text...",
    };

    setStatusTitle(modeLabels[mode] || "Reading Text...");
    setStatusSubtitle("Capturing camera frame...");
    AccessibilityInfo.announceForAccessibility(`Scanning in ${mode} mode.`);

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
        readingMode: mode,
      });

      if (requestIdRef.current !== currentRequestId) return;

      setStatusTitle("Information Read");
      setStatusSubtitle(result.spokenText);

      // If sign reading was requested, also attempt snapping location
      if (mode === "sign" && result.response.door_sign?.room_number) {
        const snapped = localizerRef.current.localizeFromOcr(
          result.response.door_sign.room_number
        );
        if (snapped.isLocalized && snapped.node) {
          setCurrentLocationId(snapped.node.id);
          setIsLocationVerified(true);
        }
      }

      setAssistantState("idle");
    } catch (err: any) {
      setAssistantState("error");
      const errText =
        err?.message || "I couldn't read that clearly, please try again.";
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

    // Priority 3 Safety: Never silently trigger route from unverified location
    if (!isLocationVerified) {
      const unverifiedMsg = `Your starting location is not verified. Please select your starting landmark from the list or scan a nearby door plaque.`;
      setStatusTitle("Start Location Needed");
      setStatusSubtitle(unverifiedMsg);
      await speechService.speak(unverifiedMsg, { force: true });
      setIsNavModalOpen(true);
      return;
    }

    setAssistantState("thinking");
    setStatusTitle("Routing...");
    setStatusSubtitle(`Finding accessible route to "${destinationQuery}"...`);

    const route = routerRef.current.findRoute(currentLocationId, destinationQuery, {
      avoidStairs,
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
        "Voice speech recognition requires an Expo development build. In Expo Go, use corner buttons or navigation search.";
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
        await speechService.speak(`Voice error: ${err}`, { force: true });
      },
      onEnd: async () => {
        if (!finalTranscript) {
          setAssistantState("idle");
          setStatusTitle("Ready");
          setStatusSubtitle("No question detected. Tap Talk to try again.");
          await speechService.speak("No question detected. Tap Talk to try again.", {
            force: true,
          });
          return;
        }

        const command = parseVoiceCommand(finalTranscript);
        console.log(`[SAARTHI Intent] Parsed "${finalTranscript}" -> ${command.intent}`);

        switch (command.intent) {
          case "read_this":
            handleReadText(command.readingMode || "auto");
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
            setAssistantState("capturing");
            const photo = await captureFrameBase64(++requestIdRef.current);
            if (photo?.base64) {
              setAssistantState("thinking");
              const visRes = await analyzeSceneWithVision(
                photo.base64,
                "What is ahead in front of me?"
              );
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
            const unkMsg = `I heard "${finalTranscript}". You can ask: Read this, Read the timetable, Where am I, Next class, Take me to the library, What is ahead, Repeat, or Stop.`;
            setStatusSubtitle(unkMsg);
            await speechService.speak(unkMsg, { force: true });
            break;
        }
      },
    });
  };

  // Navigable destinations for search & selection
  const allDestinations = routerRef.current.getNavigableDestinations();
  const filteredDestinations = destinationSearch.trim()
    ? allDestinations.filter(
        (d) =>
          d.label.toLowerCase().includes(destinationSearch.toLowerCase()) ||
          d.id.toLowerCase().includes(destinationSearch.toLowerCase()) ||
          (d.ocr_aliases &&
            d.ocr_aliases.some((a) =>
              a.toLowerCase().includes(destinationSearch.toLowerCase())
            ))
      )
    : allDestinations;

  const currentNode = routerRef.current.getNode(currentLocationId);

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

      {/* Top Header Bar & Sample Campus Data Disclosure */}
      <SafeAreaView style={styles.topSafeArea} edges={["top"]} pointerEvents="box-none">
        <View style={styles.topHeader}>
          <View style={styles.brandContainer}>
            <Text style={styles.appName} accessibilityRole="header">
              SAARTHI
            </Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {assistantState.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Top Quick Actions */}
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setIsNavModalOpen(true)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Campus Navigation and Destination Search"
              accessibilityHint="Opens list of campus destinations and routing options."
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>🧭 Map</Text>
            </Pressable>

            <Pressable
              onPress={() => setIsSettingsModalOpen(true)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Settings and Backend Server Configuration"
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>⚙️</Text>
            </Pressable>
          </View>
        </View>

        {/* Priority 2 Safety Disclosure: SAMPLE CAMPUS DATA Banner */}
        <View
          style={styles.sampleDataBanner}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel="Notice: Loaded demonstration map with sample campus data. Not real surveyed GPS coordinates."
        >
          <Text style={styles.sampleDataBannerText}>
            SAMPLE CAMPUS DATA (DEMONSTRATION MAP)
          </Text>
        </View>

        {/* Current Location Badge */}
        <View
          style={styles.locationBanner}
          accessible={true}
          accessibilityRole="text"
          accessibilityLabel={`Current location: ${currentNode?.label || "Unknown"}. Status: ${
            isLocationVerified ? "Verified" : "Unverified"
          }`}
        >
          <Text style={styles.locationBannerText}>
            📍 {currentNode?.label || "Unknown Node"}{" "}
            <Text
              style={
                isLocationVerified ? styles.verifiedText : styles.unverifiedText
              }
            >
              [{isLocationVerified ? "VERIFIED" : "UNVERIFIED"}]
            </Text>
          </Text>
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
          <Text
            style={styles.statusSubtitle}
            maxFontSizeMultiplier={1.6}
            numberOfLines={5}
          >
            {statusSubtitle}
          </Text>

          {/* Active Navigation Turn-by-Turn Card */}
          {activeRoute && (
            <View style={styles.navigationControls}>
              <View style={styles.navStepDetails}>
                <Text style={styles.navStepCounter}>
                  Step {routerRef.current.getCurrentStep()?.stepIndex || 1} of{" "}
                  {activeRoute.steps.length}
                </Text>
                <Text style={styles.navTactileGuidance}>
                  {routerRef.current.getCurrentStep()?.tactileGuidance ||
                    "Proceed cautiously along corridor."}
                </Text>
              </View>

              <View style={styles.navButtonsRow}>
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

                <Pressable
                  onPress={() => {
                    const msg = routerRef.current.repeatCurrentInstruction();
                    speechService.speak(msg, { force: true });
                  }}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Repeat Step Instruction"
                  style={styles.repeatStepButton}
                >
                  <Text style={styles.repeatStepButtonText}>Repeat</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    routerRef.current.cancelRoute();
                    setActiveRoute(null);
                    speechService.speak("Navigation cancelled.", { force: true });
                    setStatusSubtitle("Navigation cancelled.");
                  }}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel Route"
                  style={styles.cancelRouteButton}
                >
                  <Text style={styles.cancelRouteButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* 4 Fixed Corner Controls with Edge-Gesture Protection */}
      <CornerControls
        onWhereAmI={handleWhereAmI}
        onReadText={() => handleReadText("auto")}
        onStop={handleStop}
        onRepeat={handleRepeat}
        onTalk={handleTalk}
        isListening={assistantState === "listening"}
        isProcessing={
          assistantState === "capturing" || assistantState === "thinking"
        }
        isSpeaking={assistantState === "speaking"}
      />

      {/* MODAL 1: CAMPUS NAVIGATION & DESTINATION SEARCH */}
      <Modal
        visible={isNavModalOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsNavModalOpen(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} accessibilityRole="header">
              Campus Navigation
            </Text>
            <Pressable
              onPress={() => setIsNavModalOpen(false)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Close Navigation"
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseButtonText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Disclaimer */}
            <View style={styles.modalNotice}>
              <Text style={styles.modalNoticeText}>
                ⚠️ Demonstration graph loaded. Never invent surveyed routes or
                guarantee collision-free travel.
              </Text>
            </View>

            {/* Starting Location Selection */}
            <Text style={styles.sectionHeader}>Starting Location</Text>
            <Text style={styles.sectionHelper}>
              Select your current location if unverified:
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipRow}
            >
              {routerRef.current.getAllNodes().map((node) => (
                <Pressable
                  key={node.id}
                  onPress={() => {
                    setCurrentLocationId(node.id);
                    setIsLocationVerified(true);
                    speechService.speak(`Starting location set to ${node.label}`);
                  }}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`Set start location to ${node.label}`}
                  style={[
                    styles.chipButton,
                    currentLocationId === node.id && styles.chipButtonSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      currentLocationId === node.id && styles.chipTextSelected,
                    ]}
                  >
                    {node.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Accessible Route Toggle */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.toggleLabel}>Avoid Stairs (Step-Free)</Text>
                <Text style={styles.toggleSubtitle}>
                  Refuses routes when only stairs are available.
                </Text>
              </View>
              <Switch
                value={avoidStairs}
                onValueChange={setAvoidStairs}
                accessibilityLabel="Avoid Stairs option"
                trackColor={{ false: "#475569", true: "#0284C7" }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Search Destination */}
            <Text style={styles.sectionHeader}>Select Destination</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search room, library, entrance..."
              placeholderTextColor="#94A3B8"
              value={destinationSearch}
              onChangeText={setDestinationSearch}
              accessible={true}
              accessibilityLabel="Search campus destinations"
              accessibilityHint="Type a room number or building name"
            />

            {/* Destination List */}
            {filteredDestinations.map((dest) => (
              <Pressable
                key={dest.id}
                onPress={() => {
                  setIsNavModalOpen(false);
                  handleNavigateTo(dest.label);
                }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Navigate to ${dest.label}. Floor ${dest.floor}.`}
                style={styles.destCard}
              >
                <View>
                  <Text style={styles.destTitle}>{dest.label}</Text>
                  <Text style={styles.destSubtitle}>
                    {dest.building} • Floor {dest.floor} • Type: {dest.type}
                  </Text>
                </View>
                <Text style={styles.destGoText}>Go →</Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL 2: SETTINGS & BACKEND CONFIGURATION */}
      <Modal
        visible={isSettingsModalOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsSettingsModalOpen(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} accessibilityRole="header">
              Settings & Backend
            </Text>
            <Pressable
              onPress={() => setIsSettingsModalOpen(false)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Close Settings"
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseButtonText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Backend Server URL */}
            <Text style={styles.sectionHeader}>FastAPI Backend Server</Text>
            <Text style={styles.sectionHelper}>
              Host IP address running the Saarthi FastAPI backend:
            </Text>
            <TextInput
              style={styles.searchInput}
              value={backendUrlInput}
              onChangeText={setBackendUrlInput}
              placeholder="http://192.168.29.201:8000"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              accessible={true}
              accessibilityLabel="Backend server address"
            />

            <View style={styles.settingsButtonsRow}>
              <Pressable
                onPress={async () => {
                  setCustomApiBaseUrl(backendUrlInput);
                  await AsyncStorage.setItem(BACKEND_URL_KEY, backendUrlInput);
                  const isHealthy = await checkBackendHealth();
                  const msg = isHealthy
                    ? "Backend server connected successfully."
                    : "Backend server connection failed. Check Wi-Fi and firewall.";
                  await speechService.speak(msg, { force: true });
                  setStatusSubtitle(msg);
                }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Save and test backend connection"
                style={styles.saveSettingsButton}
              >
                <Text style={styles.saveSettingsButtonText}>
                  Save & Test Connection
                </Text>
              </Pressable>
            </View>

            {/* Model & AI Disclosures */}
            <Text style={[styles.sectionHeader, { marginTop: 24 }]}>
              AI Architecture & Model
            </Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Gemma 4 Multimodal</Text>
              <Text style={styles.infoDescription}>
                Model ID: gemma-4-26b-a4b-it via Google Gemini API.
                All credentials remain server-side. Images are processed
                ephemerally and not persisted.
              </Text>
            </View>

            {/* Safety & O&M Disclosures */}
            <Text style={[styles.sectionHeader, { marginTop: 24 }]}>
              Safety Standing Rules
            </Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Non-Negotiable Assistive Rules</Text>
              <Text style={styles.infoDescription}>
                1. Saarthi is an assistive companion, NOT a replacement for a
                white cane, guide dog, or O&M training.{"\n"}
                2. Never announces "the path is clear".{"\n"}
                3. Deterministic plain code computes dates and navigation routes;
                no LLM date arithmetic.{"\n"}
                4. Fail safe and fail audible on all errors.
              </Text>
            </View>

            {/* Reset Onboarding Welcome */}
            <Pressable
              onPress={async () => {
                await AsyncStorage.removeItem(ONBOARDING_KEY);
                await speechService.speak("Onboarding instructions reset.", {
                  force: true,
                });
              }}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Replay onboarding welcome message"
              style={styles.resetButton}
            >
              <Text style={styles.resetButtonText}>
                Replay Onboarding Instructions
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider style={styles.safeAreaRoot}>
      <SaarthiApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeAreaRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 10 : 6,
    paddingBottom: 8,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  appName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statusBadgeText: {
    color: "#4ADE80",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    backgroundColor: "rgba(30, 41, 59, 0.85)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  iconButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  sampleDataBanner: {
    backgroundColor: "rgba(234, 179, 8, 0.9)",
    paddingVertical: 4,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  sampleDataBannerText: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  locationBanner: {
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  locationBannerText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
  },
  verifiedText: {
    color: "#4ADE80",
    fontWeight: "800",
  },
  unverifiedText: {
    color: "#F87171",
    fontWeight: "800",
  },
  centerContainer: {
    position: "absolute",
    top: "30%",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 5,
  },
  statusCard: {
    width: "100%",
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
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
    fontSize: 19,
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
    fontSize: 14,
    lineHeight: 21,
  },
  navigationControls: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.15)",
    paddingTop: 12,
  },
  navStepDetails: {
    marginBottom: 10,
  },
  navStepCounter: {
    color: "#38BDF8",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  navTactileGuidance: {
    color: "#94A3B8",
    fontSize: 13,
    fontStyle: "italic",
  },
  navButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  advanceStepButton: {
    flex: 2,
    backgroundColor: "#0284C7",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  advanceStepButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  repeatStepButton: {
    flex: 1.2,
    backgroundColor: "rgba(51, 65, 85, 0.9)",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  repeatStepButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  cancelRouteButton: {
    flex: 1.2,
    backgroundColor: "rgba(185, 28, 28, 0.8)",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  cancelRouteButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#0B0E14",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.15)",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  modalCloseButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#0284C7",
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  modalCloseButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  modalBody: {
    flex: 1,
    padding: 20,
  },
  modalNotice: {
    backgroundColor: "rgba(234, 179, 8, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(234, 179, 8, 0.4)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  modalNoticeText: {
    color: "#FDE047",
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  sectionHelper: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    marginBottom: 20,
  },
  chipButton: {
    backgroundColor: "#1E293B",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#334155",
    minHeight: 48,
    justifyContent: "center",
  },
  chipButtonSelected: {
    backgroundColor: "#0284C7",
    borderColor: "#38BDF8",
  },
  chipText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  toggleLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  toggleSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },
  searchInput: {
    backgroundColor: "#1E293B",
    color: "#FFFFFF",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    fontSize: 15,
    marginBottom: 16,
    minHeight: 52,
  },
  destCard: {
    backgroundColor: "#131B2A",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    minHeight: 64,
  },
  destTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  destSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
  },
  destGoText: {
    color: "#38BDF8",
    fontSize: 18,
    fontWeight: "800",
    marginLeft: 10,
  },
  settingsButtonsRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  saveSettingsButton: {
    flex: 1,
    backgroundColor: "#0284C7",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  saveSettingsButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  infoCard: {
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  infoTitle: {
    color: "#38BDF8",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  infoDescription: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
  },
  resetButton: {
    marginTop: 24,
    marginBottom: 40,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(51, 65, 85, 0.6)",
    borderWidth: 1,
    borderColor: "#475569",
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  resetButtonText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "600",
  },
});
