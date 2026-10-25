import React, { useState, useEffect, useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Colors } from "./src/theme/colors";
import { speechService } from "./src/services/speech";
import { NavigationRoute } from "./src/navigation/campusRouter";
import { ReadingPipelineResult } from "./src/services/readingPipeline";

// Modular Screens
import { HomeScreen } from "./src/screens/HomeScreen";
import { CampusReaderScreen, ReadingMode } from "./src/screens/CampusReaderScreen";
import { ReadingResultsScreen } from "./src/screens/ReadingResultsScreen";
import { TimetableScreen } from "./src/screens/TimetableScreen";
import { CampusNavigationScreen } from "./src/screens/CampusNavigationScreen";
import { VoiceAssistantScreen } from "./src/screens/VoiceAssistantScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

export type AppScreen =
  | "home"
  | "reader"
  | "results"
  | "timetable"
  | "navigation"
  | "voice"
  | "settings";

const ONBOARDING_KEY = "@saarthi_onboarding_played";

export function SaarthiApp() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>("home");
  const [readerMode, setReaderMode] = useState<ReadingMode>("auto");
  const [currentReadingResult, setCurrentReadingResult] = useState<ReadingPipelineResult | null>(null);
  const [currentImageUri, setCurrentImageUri] = useState<string | undefined>(undefined);
  const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
  const [currentStartNodeId, setCurrentStartNodeId] = useState<string>("node_turing_entrance");
  const [navDestinationQuery, setNavDestinationQuery] = useState<string>("");

  // Play spoken welcome on first launch
  useEffect(() => {
    (async () => {
      try {
        const played = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!played) {
          const welcome =
            "Welcome to SAARTHI Campus Companion. Tap Read with Camera to scan campus door signs and timetables, or tap My Timetable to manage your schedule.";
          await speechService.speak(welcome, { force: true });
          await AsyncStorage.setItem(ONBOARDING_KEY, "true");
        }
      } catch {
        // Safe ignore
      }
    })();
  }, []);

  const handleNavigate = useCallback(
    (screen: AppScreen, params?: any) => {
      if (params?.mode) {
        setReaderMode(params.mode);
      }
      if (params?.destinationQuery) {
        setNavDestinationQuery(params.destinationQuery);
      }
      setCurrentScreen(screen);
    },
    []
  );

  const handleReadingComplete = (
    result: ReadingPipelineResult,
    mode: ReadingMode,
    imageUri?: string
  ) => {
    setCurrentReadingResult(result);
    setReaderMode(mode);
    setCurrentImageUri(imageUri);
    setCurrentScreen("results");
  };

  const handleSetLocationFromSign = (locationName: string) => {
    // If the room sign matches a known room e.g. "Room 204"
    if (locationName.toLowerCase().includes("204")) {
      setCurrentStartNodeId("node_cs_lab_204");
    } else {
      setCurrentStartNodeId("node_turing_entrance");
    }
  };

  const handleReplayOnboarding = async () => {
    const welcome =
      "SAARTHI Campus Companion: Point your camera to read room plaques, syllabus timetables, and notice boards. Use Campus Navigation for step-by-step accessible guidance, and check My Timetable for real-time class countdowns.";
    await speechService.speak(welcome, { force: true });
  };

  const handleCancelRoute = () => {
    setActiveRoute(null);
  };

  const handleRepeatRouteStep = async () => {
    if (activeRoute) {
      const stepIndex = activeRoute.currentStepIndex || 0;
      const step = activeRoute.steps[stepIndex];
      if (step) {
        await speechService.speak(step.spokenInstruction, { force: true });
      }
    }
  };

  return (
    <View style={styles.appContainer}>
      <StatusBar style="dark" />

      {currentScreen === "home" && (
        <HomeScreen
          onNavigate={handleNavigate}
          activeRoute={activeRoute}
          onCancelRoute={handleCancelRoute}
          onRepeatRouteStep={handleRepeatRouteStep}
        />
      )}

      {currentScreen === "reader" && (
        <CampusReaderScreen
          initialMode={readerMode}
          onNavigateBack={() => setCurrentScreen("home")}
          onReadingComplete={handleReadingComplete}
        />
      )}

      {currentScreen === "results" && currentReadingResult && (
        <ReadingResultsScreen
          result={currentReadingResult}
          mode={readerMode}
          imageUri={currentImageUri}
          onNavigateHome={() => setCurrentScreen("home")}
          onScanAnother={() => setCurrentScreen("reader")}
          onSetLocation={handleSetLocationFromSign}
          onViewTimetable={() => setCurrentScreen("timetable")}
        />
      )}

      {currentScreen === "timetable" && (
        <TimetableScreen
          onNavigateBack={() => setCurrentScreen("home")}
          onScanTimetable={() => {
            setReaderMode("timetable");
            setCurrentScreen("reader");
          }}
        />
      )}

      {currentScreen === "navigation" && (
        <CampusNavigationScreen
          initialStartNodeId={currentStartNodeId}
          initialDestinationQuery={navDestinationQuery}
          onNavigateBack={() => setCurrentScreen("home")}
          onActiveRouteChanged={setActiveRoute}
        />
      )}

      {currentScreen === "voice" && (
        <VoiceAssistantScreen
          onNavigateBack={() => setCurrentScreen("home")}
          onNavigateToReader={(mode) => {
            setReaderMode(mode || "auto");
            setCurrentScreen("reader");
          }}
          onNavigateToNavigation={(dest) => {
            setNavDestinationQuery(dest || "");
            setCurrentScreen("navigation");
          }}
          onNavigateToTimetable={() => setCurrentScreen("timetable")}
        />
      )}

      {currentScreen === "settings" && (
        <SettingsScreen
          onNavigateBack={() => setCurrentScreen("home")}
          onReplayOnboarding={handleReplayOnboarding}
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider style={styles.rootProvider}>
      <SaarthiApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootProvider: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  appContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
