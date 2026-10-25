import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { TimetableEntry } from "../utils/dateTimeReasoning";

// In-memory mock for AsyncStorage
const storageMap = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => storageMap.get(key) || null),
    setItem: jest.fn(async (key: string, value: string) => {
      storageMap.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      storageMap.delete(key);
    }),
    clear: jest.fn(async () => {
      storageMap.clear();
    }),
  },
}));

// Mock speechService directly to prevent loading react-native in Node test runner
jest.mock("./speech", () => ({
  speechService: {
    speak: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    isSpeaking: jest.fn(async () => false),
  },
}));

jest.mock("expo-mlkit-ocr", () => ({
  default: {
    detectFromUri: jest.fn(),
  },
}));

jest.mock("../api/client", () => ({
  readCampusText: jest.fn(),
  checkAIStatus: jest.fn(),
  getAiStatus: jest.fn(),
}));

import { readingPipeline } from "./readingPipeline";

describe("ReadingPipeline & Timetable Confirmation Persistence", () => {
  beforeEach(async () => {
    storageMap.clear();
    await readingPipeline.clearTimetable();
  });

  describe("Timetable Conversion & Sanitization", () => {
    it("converts extracted JSON items into typed TimetableEntry objects", () => {
      const extractedItems = [
        {
          course_name: "CS 301 Data Structures",
          course_code: "CS301",
          day_of_week: "Monday",
          start_time: "09:00",
          end_time: "10:30",
          room: "Lab 3B",
          building: "Turing Hall",
        },
        {
          course_name: "Math 201 Linear Algebra",
          course_code: "MATH201",
          day_of_week: "wednesday",
          start_time: "11:00",
          end_time: "12:30",
          room: "Hall A",
        },
      ];

      const entries = readingPipeline.convertExtractedItemsToEntries(extractedItems);
      expect(entries).toHaveLength(2);

      expect(entries[0].courseName).toBe("CS 301 Data Structures");
      expect(entries[0].dayOfWeek).toBe(1); // Monday = 1
      expect(entries[0].startTime).toBe("09:00");
      expect(entries[0].endTime).toBe("10:30");
      expect(entries[0].room).toBe("Lab 3B");
      expect(entries[0].building).toBe("Turing Hall");
      expect(entries[0].id).toBeDefined();

      expect(entries[1].courseName).toBe("Math 201 Linear Algebra");
      expect(entries[1].dayOfWeek).toBe(3); // Wednesday = 3
      expect(entries[1].startTime).toBe("11:00");
      expect(entries[1].room).toBe("Hall A");
    });

    it("assigns fallback course name and Monday if omitted in raw extraction", () => {
      const minimalItems = [{ room: "Room 101" }];
      const entries = readingPipeline.convertExtractedItemsToEntries(minimalItems);
      expect(entries).toHaveLength(1);
      expect(entries[0].courseName).toBe("Scheduled Class");
      expect(entries[0].dayOfWeek).toBe(1);
    });
  });

  describe("Timetable Confirmation & CRUD Operations", () => {
    it("never auto-saves timetable items without user confirmation", async () => {
      // Initially, schedule is empty
      const initial = await readingPipeline.getStoredTimetable();
      expect(initial).toEqual([]);

      // Only save when student explicitly confirms entries
      const sampleEntry: TimetableEntry = {
        id: "entry_1",
        courseCode: "CS201",
        courseName: "Operating Systems",
        dayOfWeek: 2, // Tuesday
        startTime: "10:00",
        endTime: "11:30",
        room: "Room 102",
      };

      await readingPipeline.saveTimetable([sampleEntry]);
      const saved = await readingPipeline.getStoredTimetable();
      expect(saved).toHaveLength(1);
      expect(saved[0].courseName).toBe("Operating Systems");
    });

    it("supports adding a new validated class entry", async () => {
      const entry1: TimetableEntry = {
        id: "entry_1",
        courseCode: "CS101",
        courseName: "Algorithms",
        dayOfWeek: 1, // Monday
        startTime: "10:00",
        endTime: "11:30",
        room: "Room 101",
      };
      await readingPipeline.addTimetableEntry(entry1);

      const entry2: TimetableEntry = {
        id: "entry_2",
        courseCode: "CS102",
        courseName: "Databases",
        dayOfWeek: 2, // Tuesday
        startTime: "14:00",
        endTime: "15:30",
        room: "Room 102",
      };
      await readingPipeline.addTimetableEntry(entry2);

      const schedule = await readingPipeline.getStoredTimetable();
      expect(schedule).toHaveLength(2);
      expect(schedule[0].courseName).toBe("Algorithms");
      expect(schedule[1].courseName).toBe("Databases");
    });

    it("supports updating an existing class entry", async () => {
      const entry: TimetableEntry = {
        id: "entry_1",
        courseCode: "CS300",
        courseName: "Computer Networks",
        dayOfWeek: 4, // Thursday
        startTime: "09:00",
        endTime: "10:30",
        room: "Room 101",
      };
      await readingPipeline.saveTimetable([entry]);

      await readingPipeline.updateTimetableEntry({
        ...entry,
        room: "Auditorium 2",
        instructor: "Dr. Rao",
      });

      const updated = await readingPipeline.getStoredTimetable();
      expect(updated[0].room).toBe("Auditorium 2");
      expect(updated[0].instructor).toBe("Dr. Rao");
    });

    it("supports deleting a class entry", async () => {
      const entry1: TimetableEntry = {
        id: "class_a",
        courseCode: "A101",
        courseName: "Class A",
        dayOfWeek: 5, // Friday
        startTime: "09:00",
        endTime: "10:00",
        room: "R1",
      };
      const entry2: TimetableEntry = {
        id: "class_b",
        courseCode: "B101",
        courseName: "Class B",
        dayOfWeek: 5, // Friday
        startTime: "10:30",
        endTime: "11:30",
        room: "R2",
      };
      await readingPipeline.saveTimetable([entry1, entry2]);

      await readingPipeline.deleteTimetableEntry("class_a");
      const remaining = await readingPipeline.getStoredTimetable();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("class_b");
    });
  });

  describe("Deterministic Next Class Query", () => {
    it("returns honest empty message when schedule is empty", async () => {
      const result = await readingPipeline.queryNextClass();
      expect(result.entry).toBeNull();
      expect(result.spokenDescription).toContain("no classes configured in your timetable");
    });
  });
});
