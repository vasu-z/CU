import * as Speech from "expo-speech";
import { Platform } from "react-native";

class SpeechService {
  private isSpeakingActive: boolean = false;
  private lastSpokenText: string | null = null;
  private speechEnabled: boolean = true;
  private preferredVoiceIdentifier: string | undefined = undefined;
  private preferredLanguage: string | undefined = undefined;
  private voicesInitialized: boolean = false;

  constructor() {
    this.initVoices();
  }

  /**
   * Enumerate available TTS voices on the device and pick the most natural English voice.
   * If none found, gracefully leaves voice undefined so iOS/Android uses system default.
   */
  public async initVoices(): Promise<void> {
    if (this.voicesInitialized) return;
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      this.voicesInitialized = true;
      if (voices && voices.length > 0) {
        console.log(`[SAARTHI Speech] Detected ${voices.length} native voices.`);
        // Look for English voices, preferring Enhanced quality if downloaded
        const enhancedEnglish = voices.find(
          (v) =>
            v.language.toLowerCase().startsWith("en") &&
            v.quality === "Enhanced"
        );
        const standardEnglish = voices.find((v) =>
          v.language.toLowerCase().startsWith("en")
        );

        const chosen = enhancedEnglish || standardEnglish;
        if (chosen) {
          this.preferredVoiceIdentifier = chosen.identifier;
          this.preferredLanguage = chosen.language;
          console.log(
            `[SAARTHI Speech] Selected voice: "${chosen.name}" (${chosen.language}, quality: ${chosen.quality})`
          );
        }
      }
    } catch (err) {
      console.warn("[SAARTHI Speech] Error querying available voices:", err);
    }
  }

  /**
   * Check whether spoken speech is globally enabled.
   */
  public isEnabled(): boolean {
    return this.speechEnabled;
  }

  /**
   * Enable or disable automatic voice announcements.
   */
  public setEnabled(enabled: boolean): void {
    this.speechEnabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  /**
   * Speak a message aloud using native text-to-speech.
   * Automatically interrupts any previously active speech with a safe transition delay to prevent overlap.
   */
  public async speak(
    text: string,
    options?: {
      rate?: number;
      pitch?: number;
      language?: string;
      force?: boolean;
      onDone?: () => void;
      onError?: (error: any) => void;
    }
  ): Promise<void> {
    if (!text || !text.trim()) {
      console.log("[SAARTHI Speech] speak() called with empty text, skipping.");
      return;
    }

    if (!this.speechEnabled && !options?.force) {
      console.log(
        "[SAARTHI Speech] Voice announcements are muted and force is false. Skipping speech."
      );
      return;
    }

    const cleanText = text.trim();
    this.lastSpokenText = cleanText;

    console.log(
      `[SAARTHI Speech] Queuing speech (length: ${cleanText.length} chars). Preview: "${cleanText.substring(0, 50)}..."`
    );

    // If currently speaking, stop and give native synthesizer a moment to reset
    try {
      const isAlreadySpeaking = await Speech.isSpeakingAsync();
      if (isAlreadySpeaking) {
        await Speech.stop();
        // Give native audio engine a brief moment to reset before starting new utterance
        await new Promise((res) => setTimeout(res, 80));
      }
    } catch {
      // Continue if isSpeaking check fails
    }

    this.isSpeakingActive = true;

    // Build speech options
    const speechOptions: Speech.SpeechOptions = {
      rate: options?.rate ?? (Platform.OS === "ios" ? 0.92 : 0.95),
      pitch: options?.pitch ?? 1.0,
      volume: 1.0, // Ensure full output volume
      useApplicationAudioSession: false, // Let system handle ducking
      onStart: () => {
        this.isSpeakingActive = true;
        console.log("[SAARTHI Speech] Audio playback started.");
      },
      onDone: () => {
        this.isSpeakingActive = false;
        console.log("[SAARTHI Speech] Audio playback completed.");
        if (options?.onDone) {
          options.onDone();
        }
      },
      onStopped: () => {
        this.isSpeakingActive = false;
        console.log("[SAARTHI Speech] Audio playback stopped.");
      },
      onError: (err) => {
        this.isSpeakingActive = false;
        console.warn("[SAARTHI Speech] Audio playback error:", err);
        if (options?.onError) {
          options.onError(err);
        }
      },
    };

    // Voice & language assignment
    if (options?.language) {
      speechOptions.language = options.language;
    } else if (this.preferredLanguage) {
      speechOptions.language = this.preferredLanguage;
    }

    if (this.preferredVoiceIdentifier) {
      speechOptions.voice = this.preferredVoiceIdentifier;
    }

    try {
      Speech.speak(cleanText, speechOptions);
    } catch (err) {
      this.isSpeakingActive = false;
      console.error("[SAARTHI Speech] Unexpected exception calling Speech.speak:", err);
      if (options?.onError) {
        options.onError(err);
      }
    }
  }

  /**
   * Immediately cut off and stop any playing speech.
   */
  public async stop(): Promise<void> {
    try {
      await Speech.stop();
      console.log("[SAARTHI Speech] Stop invoked.");
    } catch {
      // Ignore stop errors if already idle
    } finally {
      this.isSpeakingActive = false;
    }
  }

  /**
   * Replay the most recently spoken phrase or AI description.
   */
  public async repeatLast(): Promise<boolean> {
    if (this.lastSpokenText && this.lastSpokenText.trim()) {
      await this.speak(this.lastSpokenText, { force: true });
      return true;
    }
    return false;
  }

  /**
   * Retrieve the last spoken text.
   */
  public getLastSpoken(): string | null {
    return this.lastSpokenText;
  }

  /**
   * Return whether speech is currently playing.
   */
  public isSpeaking(): boolean {
    return this.isSpeakingActive;
  }

  /**
   * Return whether speech is currently playing, checking both internal state
   * and the native Expo Speech engine.
   */
  public async isSpeakingAsync(): Promise<boolean> {
    try {
      const nativeSpeaking = await Speech.isSpeakingAsync();
      return this.isSpeakingActive || Boolean(nativeSpeaking);
    } catch {
      return this.isSpeakingActive;
    }
  }
}

export const speechService = new SpeechService();
