import { Platform } from "react-native";

export interface SpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

export interface SpeechRecognitionCallbacks {
  onStart?: () => void;
  onResult?: (result: SpeechRecognitionResult) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

/**
 * Service managing native speech recognition via expo-speech-recognition.
 *
 * NOTE ON EXPO GO COMPATIBILITY:
 * Expo Go does not bundle third-party native modules. In Expo Go, requireNativeModule
 * will throw an error indicating ExpoSpeechRecognition is unavailable.
 * This service safely detects that condition, prevents crashes, and returns clear
 * diagnostic information explaining that a development build is required for voice input.
 */
class VoiceRecognitionService {
  private isAvailable: boolean = false;
  private availabilityChecked: boolean = false;
  private unavailableReason: string = "";
  private module: any = null;
  private activeSubscription: (() => void) | null = null;
  private isListening: boolean = false;

  constructor() {
    this.init();
  }

  private init(): void {
    if (this.availabilityChecked) return;

    try {
      // Dynamically require to avoid crash in Expo Go if module is absent
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const speechModule = require("expo-speech-recognition");
      if (speechModule && speechModule.ExpoSpeechRecognitionModule) {
        this.module = speechModule.ExpoSpeechRecognitionModule;
        if (typeof this.module.isRecognitionAvailable === "function") {
          const available = Boolean(this.module.isRecognitionAvailable());
          this.isAvailable = available;
          if (!available) {
            this.unavailableReason =
              "Speech recognition is not available or not enabled on this device. An Expo development build is required.";
          }
        } else {
          this.isAvailable = false;
          this.unavailableReason =
            "Speech recognition native module is incomplete in the current environment. An Expo development build is required.";
        }
      } else {
        this.isAvailable = false;
        this.unavailableReason =
          "Speech recognition native module was not found. An Expo development build is required.";
      }
    } catch (err: any) {
      console.log(
        "[SAARTHI Voice] Native speech recognition module unavailable in current environment (e.g. Expo Go):",
        err?.message || err
      );
      this.isAvailable = false;
      this.unavailableReason =
        "Speech recognition requires an Expo development build. In Expo Go, native voice input is not available.";
    }

    this.availabilityChecked = true;
  }

  /**
   * Check whether speech recognition is available on the current device and build.
   */
  public checkAvailability(): { available: boolean; reason?: string } {
    if (!this.availabilityChecked) {
      this.init();
    }
    return {
      available: this.isAvailable,
      reason: this.isAvailable ? undefined : this.unavailableReason,
    };
  }

  /**
   * Request microphone and speech recognition permissions.
   */
  public async requestPermissions(): Promise<boolean> {
    if (!this.isAvailable || !this.module) {
      return false;
    }
    try {
      if (typeof this.module.requestPermissionsAsync === "function") {
        const res = await this.module.requestPermissionsAsync();
        return res?.granted === true;
      }
      return true;
    } catch (err) {
      console.warn("[SAARTHI Voice] Permission request error:", err);
      return false;
    }
  }

  /**
   * Start listening for the user's spoken question.
   */
  public async startListening(callbacks: SpeechRecognitionCallbacks): Promise<void> {
    const status = this.checkAvailability();
    if (!status.available || !this.module) {
      const reason =
        status.reason ||
        "Speech recognition is unavailable. An Expo development build is required.";
      callbacks.onError?.(reason);
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      callbacks.onError?.(
        "Microphone or speech recognition permission was denied. Please allow access in Settings."
      );
      return;
    }

    try {
      this.cleanup();
      this.isListening = true;

      const unsubResult = this.module.addListener?.("result", (event: any) => {
        if (event?.results && event.results.length > 0) {
          const best = event.results[0];
          callbacks.onResult?.({
            transcript: best?.transcript || "",
            isFinal: event.isFinal === true,
          });
        }
      });

      const unsubError = this.module.addListener?.("error", (event: any) => {
        console.warn("[SAARTHI Voice] Native speech recognition error:", event);
        this.isListening = false;
        callbacks.onError?.(
          event?.message || event?.error || "Speech recognition encountered an error."
        );
      });

      const unsubEnd = this.module.addListener?.("end", () => {
        console.log("[SAARTHI Voice] Native speech recognition ended.");
        this.isListening = false;
        callbacks.onEnd?.();
      });

      const unsubStart = this.module.addListener?.("start", () => {
        console.log("[SAARTHI Voice] Native speech recognition started.");
        callbacks.onStart?.();
      });

      this.activeSubscription = () => {
        unsubResult?.remove?.();
        unsubError?.remove?.();
        unsubEnd?.remove?.();
        unsubStart?.remove?.();
      };

      this.module.start({
        lang: "en-US",
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
      });
    } catch (err: any) {
      this.isListening = false;
      callbacks.onError?.(
        err?.message || "Failed to start speech recognition. Please try again."
      );
    }
  }

  /**
   * Stop speech recognition and finalize results.
   */
  public stopListening(): void {
    if (this.module && this.isListening) {
      try {
        this.module.stop?.();
      } catch {
        // Safe ignore
      }
    }
    this.isListening = false;
  }

  /**
   * Abort and cancel speech recognition without returning results.
   */
  public cancelListening(): void {
    if (this.module && this.isListening) {
      try {
        this.module.abort?.();
      } catch {
        // Safe ignore
      }
    }
    this.cleanup();
    this.isListening = false;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  private cleanup(): void {
    if (this.activeSubscription) {
      try {
        this.activeSubscription();
      } catch {
        // Safe ignore
      }
      this.activeSubscription = null;
    }
  }
}

export const voiceRecognitionService = new VoiceRecognitionService();
