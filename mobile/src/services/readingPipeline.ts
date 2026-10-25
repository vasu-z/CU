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
}

class ReadingPipeline {
  /**
   * Save or update the student's personal timetable.
   */
  async saveTimetable(entries: TimetableEntry[]): Promise<void> {
    try {
      await AsyncStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      console.warn("[SAARTHI ReadingPipeline] Failed to save timetable:", err);
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
   * Query "When is my next class?" using deterministic application code.
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
   * 4. If new timetable items detected, merge into student's stored schedule.
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

    // 4. If structured timetable items returned, persist them
    let nextClassResult: NextClassResult | undefined = undefined;
    if (response.timetable_items && response.timetable_items.length > 0) {
      const dayMap: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      };

      const convertedEntries: TimetableEntry[] = response.timetable_items.map((item, idx) => ({
        id: `extracted_${Date.now()}_${idx}`,
        courseCode: item.course_code,
        courseName: item.course_name,
        room: item.room,
        building: item.building,
        dayOfWeek: dayMap[item.day_of_week.toLowerCase().trim()] ?? 1,
        startTime: item.start_time,
        endTime: item.end_time,
      }));

      await this.saveTimetable(convertedEntries);
      nextClassResult = getNextClass(convertedEntries, new Date());
    }

    // 5. Speak the result
    await speechService.speak(spokenOutput, { force: true });

    return {
      spokenText: spokenOutput,
      response,
      nextClass: nextClassResult,
    };
  }
}

export const readingPipeline = new ReadingPipeline();
