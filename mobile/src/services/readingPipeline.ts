import AsyncStorage from "@react-native-async-storage/async-storage";
import { ocrService } from "./ocr";
import { readCampusText, CampusReadingResponse } from "../api/client";
import { speechService } from "./speech";
import {
  getNextClass,
  NextClassResult,
  TimetableEntry,
} from "../utils/dateTimeReasoning";

const TIMETABLE_STORAGE_KEY = "@saarthi_student_timetable";

export interface ReadingPipelineOptions {
  imageBase64?: string;
  imageUri?: string;
  readingMode?: "auto" | "timetable" | "sign" | "notice" | "surroundings";
  signal?: AbortSignal;
}

export interface ReadingPipelineResult {
  spokenText: string;
  response: CampusReadingResponse;
  nextClass?: NextClassResult;
  extractedTimetableEntries?: TimetableEntry[];
}

class ReadingPipeline {
  /**
   * Save or replace the student's personal timetable.
   */
  async saveTimetable(entries: TimetableEntry[]): Promise<void> {
    try {
      await AsyncStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      console.warn("[SAARTHI ReadingPipeline] Failed to save timetable:", err);
    }
  }

  /**
   * Add a single new timetable entry.
   */
  async addTimetableEntry(entry: TimetableEntry): Promise<TimetableEntry[]> {
    const current = await this.getStoredTimetable();
    const updated = [...current, entry];
    await this.saveTimetable(updated);
    return updated;
  }

  /**
   * Update an existing timetable entry by ID.
   */
  async updateTimetableEntry(entry: TimetableEntry): Promise<TimetableEntry[]> {
    const current = await this.getStoredTimetable();
    const updated = current.map((e) => (e.id === entry.id ? entry : e));
    await this.saveTimetable(updated);
    return updated;
  }

  /**
   * Delete a timetable entry by ID.
   */
  async deleteTimetableEntry(id: string): Promise<TimetableEntry[]> {
    const current = await this.getStoredTimetable();
    const updated = current.filter((e) => e.id !== id);
    await this.saveTimetable(updated);
    return updated;
  }

  /**
   * Clear all stored timetable entries.
   */
  async clearTimetable(): Promise<void> {
    try {
      await AsyncStorage.removeItem(TIMETABLE_STORAGE_KEY);
    } catch (err) {
      console.warn("[SAARTHI ReadingPipeline] Failed to clear timetable:", err);
    }
  }

  /**
   * Load the stored timetable.
   */
  async getStoredTimetable(): Promise<TimetableEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(TIMETABLE_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn("[SAARTHI ReadingPipeline] Failed to load timetable:", err);
    }
    return [];
  }

  /**
   * Convert raw backend TimetableItem[] to typed TimetableEntry[].
   */
  convertExtractedItemsToEntries(items: any[]): TimetableEntry[] {
    const dayMap: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    return items.map((item, idx) => ({
      id: `extracted_${Date.now()}_${idx}`,
      courseCode: (item.course_code || "CLASS").trim(),
      courseName: (item.course_name || "Scheduled Class").trim(),
      room: (item.room || "Unassigned").trim(),
      building: item.building ? item.building.trim() : undefined,
      dayOfWeek: dayMap[(item.day_of_week || "").toLowerCase().trim()] ?? 1,
      startTime: item.start_time || "09:00",
      endTime: item.end_time || "10:00",
    }));
  }

  /**
   * Query "When is my next class?" using deterministic application code.
   * If timetable is empty, speaks an honest prompt asking the user to add classes.
   */
  async queryNextClass(): Promise<NextClassResult> {
    const timetable = await this.getStoredTimetable();
    const result = getNextClass(timetable, new Date());
    await speechService.speak(result.spokenDescription, { force: true });
    return result;
  }

  /**
   * Execute the full reading pipeline:
   * 1. Extract text locally with OCR if URI provided and native OCR supported.
   * 2. Send image or OCR text to Gemma 4 via /campus/read.
   * 3. Validate structured response.
   * 4. If timetable items detected, convert them for user confirmation (DO NOT silently overwrite).
   * 5. Speak result aloud (or audible retry if low confidence).
   */
  async processCampusImage(options: ReadingPipelineOptions): Promise<ReadingPipelineResult> {
    let extractedOcrText: string | undefined = undefined;

    // 1. Try local on-device OCR first if imageUri is present
    if (options.imageUri) {
      const ocrResult = await ocrService.recognizeTextFromUri(options.imageUri);
      if (ocrResult.text && ocrResult.text.length > 5) {
        extractedOcrText = ocrResult.text;
        console.log(`[SAARTHI ReadingPipeline] On-device OCR extracted ${extractedOcrText.length} chars.`);
      }
    }

    // 2. Call backend campus reading endpoint
    let response: CampusReadingResponse;
    try {
      response = await readCampusText(
        {
          imageBase64: options.imageBase64,
          ocrText: extractedOcrText,
          readingMode: options.readingMode || "auto",
        },
        options.signal
      );
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw error;
      }
      // Rule 4: Fail safe and fail audible
      const failMessage = "I encountered a network problem reading that. Please tap Repeat to try again.";
      await speechService.speak(failMessage, { force: true });
      throw new Error(failMessage);
    }

    // 3. Safety check for low confidence / blur
    let spokenOutput = response.spoken_summary;
    if (response.needs_rescan || response.confidence < 0.65) {
      spokenOutput = "I couldn't read that clearly, please try again.";
    }

    // 4. If structured timetable items returned, format them for confirmation (never silently persist)
    let nextClassResult: NextClassResult | undefined = undefined;
    let extractedTimetableEntries: TimetableEntry[] | undefined = undefined;
    if (response.timetable_items && response.timetable_items.length > 0) {
      extractedTimetableEntries = this.convertExtractedItemsToEntries(response.timetable_items);
      nextClassResult = getNextClass(extractedTimetableEntries, new Date());
    }

    // 5. Speak the result
    await speechService.speak(spokenOutput, { force: true });

    return {
      spokenText: spokenOutput,
      response,
      nextClass: nextClassResult,
      extractedTimetableEntries,
    };
  }
}

export const readingPipeline = new ReadingPipeline();
