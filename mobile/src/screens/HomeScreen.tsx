import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  AccessibilityInfo,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../theme/colors";
import { speechService } from "../services/speech";
import { hapticsService } from "../services/haptics";
import { readingPipeline } from "../services/readingPipeline";
import { checkBackendHealth, getAiStatus } from "../api/client";
import { TimetableEntry, NextClassResult, getNextClass } from "../utils/dateTimeReasoning";
import { NavigationRoute } from "../navigation/campusRouter";

export interface HomeScreenProps {
  onNavigate: (
    screen: "home" | "reader" | "results" | "timetable" | "navigation" | "voice" | "settings",
    params?: any
  ) => void;
  activeRoute: NavigationRoute | null;
  onCancelRoute: () => void;
  onRepeatRouteStep: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigate,
  activeRoute,
  onCancelRoute,
  onRepeatRouteStep,
}) => {
  const [nextClass, setNextClass] = useState<NextClassResult | null>(null);
  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [backendLatency, setBackendLatency] = useState<number | null>(null);
  const [isAiConfigured, setIsAiConfigured] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Load next class and check real backend status
  const refreshStatus = useCallback(async () => {
    // 1. Timetable reasoning
    try {
      const timetable = await readingPipeline.getStoredTimetable();
      const next = getNextClass(timetable, new Date());
      setNextClass(next);
    } catch {
      setNextClass(null);
    }

    // 2. Real Backend ping
    const startTime = Date.now();
    try {
      const health = await checkBackendHealth();
      const latency = Date.now() - startTime;
      if (health.status === "healthy") {
        setBackendStatus("connected");
        setBackendLatency(latency);
        try {
          const ai = await getAiStatus();
          setIsAiConfigured(Boolean(ai.configured));
        } catch {
          setIsAiConfigured(false);
        }
      } else {
        setBackendStatus("offline");
      }
    } catch {
      setBackendStatus("offline");
      setBackendLatency(null);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleStopSpeech = async () => {
    await hapticsService.triggerBottomLeft();
    await speechService.stop();
    setIsSpeaking(false);
  };

  const handleRepeatSpeech = async () => {
    await hapticsService.triggerBottomLeft();
    const repeated = await speechService.repeatLast();
    if (!repeated) {
      await speechService.speak("Nothing to repeat yet.", { force: true });
    }
  };

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      accessibilityRole="none"
      accessibilityLabel="Saarthi Home Screen"
    >
      {/* 1. Header & Identity */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>SAARTHI</Text>
          </View>
          <Text style={styles.appVersion}>v1.0.0</Text>
        </View>

        <Text style={styles.greeting} accessibilityRole="header">
          {getGreeting()}
        </Text>
        <Text style={styles.subGreeting}>
          Your campus companion for reading, schedule, and navigation.
        </Text>
      </View>

      {/* 2. Honest Backend Connection Badge */}
      <View
        style={[
          styles.statusCard,
          backendStatus === "connected" ? styles.statusCardConnected : styles.statusCardOffline,
        ]}
        accessible={true}
        accessibilityRole="summary"
        accessibilityLabel={
          backendStatus === "connected"
            ? `Backend connected with ${backendLatency ?? 0} milliseconds latency. Gemma 4 AI active.`
            : "Backend disconnected. Local OCR and campus navigation available offline."
        }
      >
        <View style={styles.statusIndicatorRow}>
          <View
            style={[
              styles.statusDot,
              backendStatus === "connected" ? styles.statusDotGreen : styles.statusDotAmber,
            ]}
          />
          <Text style={styles.statusTitle}>
            {backendStatus === "checking"
              ? "Checking Server..."
              : backendStatus === "connected"
              ? "Backend Server Connected"
              : "Offline / Standalone Mode"}
          </Text>
        </View>

        <Text style={styles.statusDescription}>
          {backendStatus === "connected"
            ? `Active latency: ${backendLatency ?? 0}ms • Gemma 4 Vision ready`
            : "Cannot reach backend. On-device timetable & campus router remain active."}
        </Text>
      </View>

      {/* 3. Active Route Card (if navigating) */}
      {activeRoute && (
        <View style={styles.activeRouteCard} accessible={true} accessibilityRole="alert">
          <View style={styles.activeRouteHeader}>
            <Ionicons name="navigate-circle" size={24} color={Colors.primary} />
            <Text style={styles.activeRouteTitle}>Active Route in Progress</Text>
          </View>
          <Text style={styles.activeRouteDestination}>
            Destination: {activeRoute.steps[activeRoute.steps.length - 1]?.toNode.label || "Campus Landmark"}
          </Text>
          <Text style={styles.activeRouteStep}>
            Current step: {(activeRoute.currentStepIndex ?? 0) + 1} of {activeRoute.steps.length}
          </Text>
          <View style={styles.routeButtonsRow}>
            <Pressable
              onPress={() => onNavigate("navigation")}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Resume Active Route Navigation"
              style={styles.resumeRouteButton}
            >
              <Text style={styles.resumeRouteButtonText}>Resume Route</Text>
            </Pressable>
            <Pressable
              onPress={onRepeatRouteStep}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Repeat Current Instruction"
              style={styles.repeatRouteButton}
            >
              <Text style={styles.repeatRouteButtonText}>Repeat</Text>
            </Pressable>
            <Pressable
              onPress={onCancelRoute}
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

      {/* 4. Next Class Highlight Card */}
      <Pressable
        onPress={() => onNavigate("timetable")}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={
          nextClass && nextClass.entry
            ? `Next class: ${nextClass.entry.courseName} at ${nextClass.entry.startTime} in ${nextClass.entry.room}. Tap to open timetable.`
            : "No classes scheduled today. Tap to open and manage timetable."
        }
        accessibilityHint="Opens personal class timetable screen"
        style={styles.timetablePreviewCard}
      >
        <View style={styles.timetablePreviewHeader}>
          <View style={styles.timetableIconCircle}>
            <Ionicons name="calendar-outline" size={22} color={Colors.primary} />
          </View>
          <View style={styles.timetableHeaderTextWrap}>
            <Text style={styles.timetablePreviewTag}>
              {nextClass?.status === "in_progress"
                ? "CLASS IN PROGRESS"
                : nextClass?.status === "upcoming"
                ? "UPCOMING CLASS"
                : "MY SCHEDULE"}
            </Text>
            <Text style={styles.timetablePreviewTitle}>
              {nextClass?.entry ? nextClass.entry.courseName : "No classes scheduled today"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </View>

        {nextClass?.entry ? (
          <View style={styles.classDetailsRow}>
            <Text style={styles.classTimeText}>
              🕒 {nextClass.entry.startTime} - {nextClass.entry.endTime}
            </Text>
            <Text style={styles.classRoomText}>
              📍 {nextClass.entry.room} {nextClass.entry.building ? `(${nextClass.entry.building})` : ""}
            </Text>
          </View>
        ) : (
          <Text style={styles.timetableEmptyHint}>
            Scan a syllabus or add classes manually to see countdowns.
          </Text>
        )}
      </Pressable>

      {/* 5. PRIMARY ACTION: Read with Camera */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Primary Action
        </Text>
      </View>

      <Pressable
        onPress={async () => {
          await hapticsService.triggerTopRight();
          onNavigate("reader");
        }}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Read with Camera. Scan door signs, timetables, and campus noticeboards."
        accessibilityHint="Opens live camera scanner with reading modes"
        style={({ pressed }) => [
          styles.primaryCameraCard,
          pressed && styles.primaryCameraCardPressed,
        ]}
      >
        <View style={styles.primaryCameraIconCircle}>
          <Ionicons name="camera" size={36} color="#FFFFFF" />
        </View>
        <View style={styles.primaryCameraTextContainer}>
          <Text style={styles.primaryCameraTitle}>Read with Camera</Text>
          <Text style={styles.primaryCameraDescription}>
            Point your phone at door signs, classroom numbers, timetables, or printed notices.
          </Text>
        </View>
        <View style={styles.cameraActionArrow}>
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
        </View>
      </Pressable>

      {/* 6. SECONDARY ACTIONS GRID */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Campus Utilities
        </Text>
      </View>

      <View style={styles.actionsGrid}>
        {/* My Timetable */}
        <Pressable
          onPress={() => onNavigate("timetable")}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="My Timetable. View and edit your class schedule."
          style={({ pressed }) => [
            styles.secondaryActionCard,
            pressed && styles.secondaryActionCardPressed,
          ]}
        >
          <View style={styles.secondaryIconCircle}>
            <Ionicons name="time-outline" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.secondaryActionTitle}>My Timetable</Text>
          <Text style={styles.secondaryActionDescription}>
            Class countdowns & editable weekly schedule
          </Text>
        </Pressable>

        {/* Navigate Campus */}
        <Pressable
          onPress={() => onNavigate("navigation")}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Navigate Campus. Find accessible stair-free routes between classrooms and landmarks."
          style={({ pressed }) => [
            styles.secondaryActionCard,
            pressed && styles.secondaryActionCardPressed,
          ]}
        >
          <View style={styles.secondaryIconCircle}>
            <Ionicons name="compass-outline" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.secondaryActionTitle}>Navigate Campus</Text>
          <Text style={styles.secondaryActionDescription}>
            Accessible step-by-step route guidance
          </Text>
        </Pressable>

        {/* Talk to Saarthi (Voice Assistant) */}
        <Pressable
          onPress={() => onNavigate("voice")}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Voice Assistant. Push to talk and speak campus commands."
          style={({ pressed }) => [
            styles.secondaryActionCard,
            pressed && styles.secondaryActionCardPressed,
          ]}
        >
          <View style={styles.secondaryIconCircle}>
            <Ionicons name="mic-outline" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.secondaryActionTitle}>Talk to Saarthi</Text>
          <Text style={styles.secondaryActionDescription}>
            Push-to-talk voice commands & questions
          </Text>
        </Pressable>

        {/* Settings */}
        <Pressable
          onPress={() => onNavigate("settings")}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Settings. Configure backend server URL, speech options, and developer mode."
          style={({ pressed }) => [
            styles.secondaryActionCard,
            pressed && styles.secondaryActionCardPressed,
          ]}
        >
          <View style={styles.secondaryIconCircle}>
            <Ionicons name="settings-outline" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.secondaryActionTitle}>Settings</Text>
          <Text style={styles.secondaryActionDescription}>
            Server URL, speech settings & privacy
          </Text>
        </Pressable>
      </View>

      {/* 7. Quick Audio Control Bar */}
      <View style={styles.audioControlsSection}>
        <Text style={styles.audioControlsLabel}>Quick Speech Controls</Text>
        <View style={styles.audioButtonsRow}>
          <Pressable
            onPress={handleStopSpeech}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Stop audio speech immediately"
            style={styles.stopAudioButton}
          >
            <Ionicons name="stop-circle" size={22} color="#FFFFFF" />
            <Text style={styles.stopAudioButtonText}>Stop Speaking</Text>
          </Pressable>

          <Pressable
            onPress={handleRepeatSpeech}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Repeat the last spoken announcement"
            style={styles.repeatAudioButton}
          >
            <Ionicons name="refresh-circle" size={22} color={Colors.primary} />
            <Text style={styles.repeatAudioButtonText}>Repeat Last</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 60,
  },
  header: {
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  brandBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  brandBadgeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  appVersion: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  greeting: {
    fontSize: 28,
    fontWeight: "900",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subGreeting: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  statusCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 18,
  },
  statusCardConnected: {
    backgroundColor: Colors.successBackground,
    borderColor: Colors.success,
  },
  statusCardOffline: {
    backgroundColor: Colors.warningBackground,
    borderColor: Colors.warning,
  },
  statusIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusDotGreen: {
    backgroundColor: Colors.statusActive,
  },
  statusDotAmber: {
    backgroundColor: Colors.warning,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  statusDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  activeRouteCard: {
    backgroundColor: "#F0F9FF",
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
  },
  activeRouteHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  activeRouteTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.primary,
    marginLeft: 8,
  },
  activeRouteDestination: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  activeRouteStep: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  routeButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  resumeRouteButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  resumeRouteButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  repeatRouteButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  repeatRouteButtonText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  cancelRouteButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.error,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelRouteButtonText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: "700",
  },
  timetablePreviewCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  timetablePreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  timetableIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  timetableHeaderTextWrap: {
    flex: 1,
  },
  timetablePreviewTag: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  timetablePreviewTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  classDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  classTimeText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  classRoomText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  timetableEmptyHint: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  primaryCameraCard: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    minHeight: 96,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryCameraCardPressed: {
    backgroundColor: Colors.primaryHover,
    transform: [{ scale: 0.98 }],
  },
  primaryCameraIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  primaryCameraTextContainer: {
    flex: 1,
  },
  primaryCameraTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  primaryCameraDescription: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.88)",
    lineHeight: 18,
  },
  cameraActionArrow: {
    marginLeft: 8,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 24,
  },
  secondaryActionCard: {
    width: "48%",
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    minHeight: 140,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  secondaryActionCardPressed: {
    backgroundColor: Colors.backgroundAlt,
    transform: [{ scale: 0.98 }],
  },
  secondaryIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  secondaryActionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  secondaryActionDescription: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  audioControlsSection: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
  },
  audioControlsLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  audioButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  stopAudioButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.stopButton,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 52,
  },
  stopAudioButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  repeatAudioButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 52,
  },
  repeatAudioButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
});
