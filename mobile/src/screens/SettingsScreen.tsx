import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  ActivityIndicator,
  AccessibilityInfo,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../theme/colors";
import { speechService } from "../services/speech";
import { hapticsService } from "../services/haptics";
import {
  getApiBaseUrl,
  setCustomApiBaseUrl,
  checkBackendHealth,
  getAiStatus,
} from "../api/client";

export interface SettingsScreenProps {
  onNavigateBack: () => void;
  onReplayOnboarding: () => void;
}

const BACKEND_URL_KEY = "@saarthi_backend_url";
const MOCK_MODE_KEY = "@saarthi_mock_mode";

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onNavigateBack,
  onReplayOnboarding,
}) => {
  const [backendUrl, setBackendUrl] = useState<string>(getApiBaseUrl());
  const [testResult, setTestResult] = useState<{
    status: "idle" | "testing" | "success" | "error";
    message: string;
    latency?: number;
    model?: string;
  }>({ status: "idle", message: "" });

  const [speechEnabled, setSpeechEnabled] = useState<boolean>(speechService.isEnabled());
  const [developerMockMode, setDeveloperMockMode] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const storedUrl = await AsyncStorage.getItem(BACKEND_URL_KEY);
        if (storedUrl) {
          setBackendUrl(storedUrl);
        }
        const storedMock = await AsyncStorage.getItem(MOCK_MODE_KEY);
        if (storedMock === "true") {
          setDeveloperMockMode(true);
        }
      } catch {
        // Safe ignore
      }
    })();
  }, []);

  const handleTestConnection = async () => {
    await hapticsService.triggerButtonPress();
    setTestResult({ status: "testing", message: "Connecting to backend server..." });
    const startTime = Date.now();

    try {
      const health = await checkBackendHealth();
      const latency = Date.now() - startTime;
      let model = "Gemma 4";
      try {
        const ai = await getAiStatus();
        model = ai.model || model;
      } catch {
        // Safe ignore
      }

      setTestResult({
        status: "success",
        message: `Connected successfully (${latency}ms). Backend is ${health.status}.`,
        latency,
        model,
      });
      await speechService.speak(`Backend server connected with ${latency} milliseconds latency.`, {
        force: true,
      });
    } catch (err: any) {
      const latency = Date.now() - startTime;
      const msg = `Connection failed (${latency}ms): ${err?.message || "Server unreachable"}`;
      setTestResult({ status: "error", message: msg });
      await speechService.speak("Backend server is unreachable. Check your Wi-Fi network and IP address.", {
        force: true,
      });
    }
  };

  const handleSaveBackendUrl = async () => {
    await hapticsService.triggerSuccess();
    const cleanUrl = backendUrl.trim().replace(/\/+$/, "");
    setCustomApiBaseUrl(cleanUrl);
    await AsyncStorage.setItem(BACKEND_URL_KEY, cleanUrl);
    await speechService.speak(`Backend URL updated to ${cleanUrl}.`, { force: true });
    await handleTestConnection();
  };

  const handleApplyPreset = (presetUrl: string) => {
    setBackendUrl(presetUrl);
  };

  const handleToggleSpeech = (enabled: boolean) => {
    setSpeechEnabled(enabled);
    speechService.setEnabled(enabled);
    if (enabled) {
      speechService.speak("Voice announcements enabled.", { force: true });
    }
  };

  const handleToggleMockMode = async (enabled: boolean) => {
    setDeveloperMockMode(enabled);
    await AsyncStorage.setItem(MOCK_MODE_KEY, enabled ? "true" : "false");
    const spoken = enabled
      ? "Developer mock mode enabled for offline testing."
      : "Developer mock mode disabled. Real Gemma 4 active.";
    await speechService.speak(spoken, { force: true });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 1. Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={onNavigateBack}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          <Text style={styles.backButtonText}>Home</Text>
        </Pressable>

        <Text style={styles.screenTitle} accessibilityRole="header">
          Settings
        </Text>

        <View style={{ width: 40 }} />
      </View>

      {/* 2. Backend Server Configuration */}
      <View style={styles.card} accessible={true}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="server-outline" size={22} color={Colors.primary} />
          <Text style={styles.cardTitle}>Backend Server Connection</Text>
        </View>
        <Text style={styles.cardDescription}>
          Specify your local network FastAPI server running Gemma 4:
        </Text>

        <TextInput
          style={styles.urlInput}
          value={backendUrl}
          onChangeText={setBackendUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessible={true}
          accessibilityLabel="Backend server base URL input"
        />

        {/* IP Presets */}
        <Text style={styles.presetsLabel}>Common Presets:</Text>
        <View style={styles.presetsRow}>
          <Pressable
            onPress={() => handleApplyPreset("http://192.168.29.201:8000")}
            style={styles.presetChip}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Apply PC LAN IP preset: 192.168.29.201:8000"
          >
            <Text style={styles.presetChipText}>PC LAN (192.168.29.201:8000)</Text>
          </Pressable>

          <Pressable
            onPress={() => handleApplyPreset("http://10.0.2.2:8000")}
            style={styles.presetChip}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Apply Android Emulator preset: 10.0.2.2:8000"
          >
            <Text style={styles.presetChipText}>Emulator (10.0.2.2:8000)</Text>
          </Pressable>

          <Pressable
            onPress={() => handleApplyPreset("http://localhost:8000")}
            style={styles.presetChip}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Apply Localhost preset: localhost:8000"
          >
            <Text style={styles.presetChipText}>Localhost (127.0.0.1:8000)</Text>
          </Pressable>
        </View>

        {/* Buttons Row */}
        <View style={styles.buttonRow}>
          <Pressable
            onPress={handleSaveBackendUrl}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Save backend server URL"
            style={styles.saveUrlButton}
          >
            <Text style={styles.saveUrlButtonText}>Save URL</Text>
          </Pressable>

          <Pressable
            onPress={handleTestConnection}
            disabled={testResult.status === "testing"}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Test connection to backend"
            style={styles.testConnectionButton}
          >
            {testResult.status === "testing" ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.testConnectionButtonText}>Test Connection</Text>
            )}
          </Pressable>
        </View>

        {/* Test Result Feedback */}
        {testResult.status !== "idle" && (
          <View
            style={[
              styles.testResultBox,
              testResult.status === "success"
                ? styles.testResultSuccess
                : testResult.status === "error"
                ? styles.testResultError
                : styles.testResultTesting,
            ]}
          >
            <Ionicons
              name={
                testResult.status === "success"
                  ? "checkmark-circle"
                  : testResult.status === "error"
                  ? "alert-circle"
                  : "hourglass-outline"
              }
              size={18}
              color={
                testResult.status === "success"
                  ? Colors.success
                  : testResult.status === "error"
                  ? Colors.error
                  : Colors.primary
              }
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.testResultText}>{testResult.message}</Text>
              {testResult.model && (
                <Text style={styles.testResultModel}>Model: {testResult.model}</Text>
              )}
            </View>
          </View>
        )}
      </View>

      {/* 3. Audio & Speech Settings */}
      <View style={styles.card} accessible={true}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="volume-medium-outline" size={22} color={Colors.primary} />
          <Text style={styles.cardTitle}>Speech & Audio</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingTitle}>Automatic Voice Announcements</Text>
            <Text style={styles.settingDescription}>
              Read recognized door signs, timetable countdowns, and navigation steps aloud automatically.
            </Text>
          </View>
          <Switch
            value={speechEnabled}
            onValueChange={handleToggleSpeech}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor="#FFFFFF"
            accessible={true}
            accessibilityLabel="Toggle automatic voice announcements"
          />
        </View>

        <Pressable
          onPress={onReplayOnboarding}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Replay onboarding welcome instructions"
          style={styles.secondaryCardButton}
        >
          <Ionicons name="play-circle-outline" size={20} color={Colors.primary} />
          <Text style={styles.secondaryCardButtonText}>Replay Welcome Instructions</Text>
        </Pressable>
      </View>

      {/* 4. Developer / Mock Mode */}
      <View style={styles.card} accessible={true}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="construct-outline" size={22} color={Colors.primary} />
          <Text style={styles.cardTitle}>Developer Options</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingTitle}>Offline Developer Mock Mode</Text>
            <Text style={styles.settingDescription}>
              Simulates Gemma 4 AI responses for automated tests and development when no backend or API key is active.
              Default: Disabled (Real Gemma 4 is used).
            </Text>
          </View>
          <Switch
            value={developerMockMode}
            onValueChange={handleToggleMockMode}
            trackColor={{ false: Colors.border, true: Colors.warning }}
            thumbColor="#FFFFFF"
            accessible={true}
            accessibilityLabel="Toggle developer mock mode"
          />
        </View>
      </View>

      {/* 5. Privacy & Ethics Disclosure */}
      <View style={styles.card} accessible={true}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="shield-checkmark-outline" size={22} color={Colors.primary} />
          <Text style={styles.cardTitle}>Privacy & Safety Disclosure</Text>
        </View>
        <Text style={styles.privacyBody}>
          • Camera frames and audio are captured solely in direct response to user button or voice commands.
          {"\n"}• No background surveillance or continuous camera recording is performed.
          {"\n"}• Images are transmitted securely to your university's configured backend server for text extraction and are never sold or permanently archived.
          {"\n"}• SAARTHI is an assistive reading and navigation aid. It does not replace a white cane, guide dog, or physical orientation training.
        </Text>
      </View>

      {/* 6. Build Information */}
      <View style={styles.footerBuildCard} accessible={true}>
        <Text style={styles.footerBuildTitle}>SAARTHI Campus Mode</Text>
        <Text style={styles.footerBuildText}>
          Version 1.0.0 (Expo SDK 57 • React Native 0.86)
          {"\n"}Licensed under Apache-2.0
        </Text>
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
    paddingTop: 48,
    paddingBottom: 60,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  cardDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  urlInput: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  presetsLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  presetsRow: {
    flexDirection: "column",
    gap: 6,
    marginBottom: 16,
  },
  presetChip: {
    backgroundColor: Colors.backgroundAlt,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  saveUrlButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  saveUrlButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  testConnectionButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  testConnectionButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  testResultBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  testResultSuccess: {
    backgroundColor: Colors.successBackground,
  },
  testResultError: {
    backgroundColor: Colors.errorBackground,
  },
  testResultTesting: {
    backgroundColor: Colors.primaryLight,
  },
  testResultText: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  testResultModel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "700",
    marginTop: 2,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  settingTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  secondaryCardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primaryLight,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
    minHeight: 48,
  },
  secondaryCardButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  privacyBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  footerBuildCard: {
    alignItems: "center",
    paddingVertical: 16,
  },
  footerBuildTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.textMuted,
    marginBottom: 4,
  },
  footerBuildText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
});
