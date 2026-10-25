/**
 * Saarthi Deterministic Voice Intent Classifier.
 *
 * Implements deterministic intent parsing for spoken university commands.
 * Rule 3: Models EXTRACT; plain code REASONS.
 */

export type VoiceIntentType =
  | "read_this"
  | "what_is_ahead"
  | "where_am_i"
  | "next_class"
  | "navigate_to"
  | "repeat"
  | "stop"
  | "unknown";

export interface ParsedVoiceCommand {
  intent: VoiceIntentType;
  rawTranscript: string;
  destinationQuery?: string;
  confidence: number;
}

/**
 * Clean a voice transcript for normalized matching.
 */
function cleanTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "") // Normalize "what's" -> "whats", "where's" -> "wheres"
    .replace(/[.,?!:;'"-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/**
 * Classifies a user's speech transcript into one of the 7 supported campus intents.
 */
export function parseVoiceCommand(transcript: string): ParsedVoiceCommand {
  const cleaned = cleanTranscript(transcript);

  if (!cleaned) {
    return { intent: "unknown", rawTranscript: transcript, confidence: 0 };
  }

  // 1. STOP intent (immediate priority)
  if (
    cleaned === "stop" ||
    cleaned === "cancel" ||
    cleaned === "quiet" ||
    cleaned === "shut up" ||
    cleaned.startsWith("stop speaking") ||
    cleaned.startsWith("stop reading")
  ) {
    return { intent: "stop", rawTranscript: transcript, confidence: 1.0 };
  }

  // 2. REPEAT intent
  if (
    cleaned === "repeat" ||
    cleaned === "again" ||
    cleaned === "say again" ||
    cleaned === "repeat that" ||
    cleaned === "repeat instruction" ||
    cleaned === "what did you say"
  ) {
    return { intent: "repeat", rawTranscript: transcript, confidence: 1.0 };
  }

  // 3. READ THIS intent
  if (
    cleaned === "read this" ||
    cleaned === "read text" ||
    cleaned === "read the sign" ||
    cleaned === "read the notice" ||
    cleaned === "read noticeboard" ||
    cleaned.startsWith("read this") ||
    cleaned.startsWith("read the") ||
    cleaned === "scan text" ||
    cleaned === "ocr"
  ) {
    return { intent: "read_this", rawTranscript: transcript, confidence: 0.95 };
  }

  // 4. WHAT IS AHEAD intent
  if (
    cleaned === "what is ahead" ||
    cleaned === "whats ahead" ||
    cleaned === "what is in front of me" ||
    cleaned === "what is in front" ||
    cleaned === "describe scene" ||
    cleaned === "what do you see" ||
    cleaned.includes("what do you see") ||
    cleaned === "describe" ||
    cleaned.includes("what is ahead") ||
    cleaned.includes("whats ahead")
  ) {
    return { intent: "what_is_ahead", rawTranscript: transcript, confidence: 0.95 };
  }


  // 5. WHERE AM I intent
  if (
    cleaned === "where am i" ||
    cleaned === "where am i now" ||
    cleaned === "what room is this" ||
    cleaned === "which room is this" ||
    cleaned === "location" ||
    cleaned === "my location" ||
    cleaned.includes("where am i")
  ) {
    return { intent: "where_am_i", rawTranscript: transcript, confidence: 0.95 };
  }

  // 6. WHEN IS MY NEXT CLASS intent
  if (
    cleaned === "when is my next class" ||
    cleaned === "next class" ||
    cleaned === "what is my next class" ||
    cleaned === "where is my next class" ||
    cleaned === "what class is next" ||
    cleaned === "schedule" ||
    cleaned === "my timetable" ||
    cleaned.includes("next class")
  ) {
    return { intent: "next_class", rawTranscript: transcript, confidence: 0.95 };
  }

  // 7. TAKE ME TO <PLACE> intent
  const navPatterns = [
    /^take me to (?:the )?(.+)$/,
    /^navigate to (?:the )?(.+)$/,
    /^directions to (?:the )?(.+)$/,
    /^how do i get to (?:the )?(.+)$/,
    /^where is (?:the )?(.+)$/,
    /^guide me to (?:the )?(.+)$/,
    /^find (?:the )?(.+)$/,
  ];

  for (const pattern of navPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const dest = match[1].trim();
      if (dest.length >= 2) {
        return {
          intent: "navigate_to",
          rawTranscript: transcript,
          destinationQuery: dest,
          confidence: 0.95,
        };
      }
    }
  }

  return {
    intent: "unknown",
    rawTranscript: transcript,
    confidence: 0.3,
  };
}
