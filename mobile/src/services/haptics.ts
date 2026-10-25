import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export class HapticsService {
  /**
   * Top-Left corner: "Where am I" / Orientation (Light crisp tap)
   */
  async triggerTopLeft(): Promise<void> {
    try {
      if (Platform.OS !== "web") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Safe fallback on unsupported platforms
    }
  }

  /**
   * Top-Right corner: "Read Notice / Timetable" (Medium distinct double-feel tap)
   */
  async triggerTopRight(): Promise<void> {
    try {
      if (Platform.OS !== "web") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {
      // Safe fallback
    }
  }

  /**
   * Bottom-Left corner: "Stop" / Cancel (Warning notification pulse)
   */
  async triggerBottomLeft(): Promise<void> {
    try {
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch {
      // Safe fallback
    }
  }

  /**
   * Bottom-Right corner: "Talk to Saarthi" / Voice push-to-talk (Heavy solid buzz)
   */
  async triggerBottomRight(): Promise<void> {
    try {
      if (Platform.OS !== "web") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    } catch {
      // Safe fallback
    }
  }

  /**
   * Fail-Safe error warning vibration
   */
  async triggerError(): Promise<void> {
    try {
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      // Safe fallback
    }
  }

  /**
   * Success confirmation vibration
   */
  async triggerSuccess(): Promise<void> {
    try {
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      // Safe fallback
    }
  }

  /**
   * Standard accessible button press feedback
   */
  async triggerButtonPress(): Promise<void> {
    await this.triggerTopLeft();
  }

  /**
   * Camera shutter / capture action feedback
   */
  async triggerCapture(): Promise<void> {
    await this.triggerTopRight();
  }
}

export const hapticsService = new HapticsService();
