import { describe, it, expect } from "@jest/globals";
import {
  parseTimeString,
  formatSpokenTime,
  getNextClass,
  TimetableEntry,
} from "./dateTimeReasoning";


describe("dateTimeReasoning — Deterministic Calendar & Class Reasoning", () => {
  describe("parseTimeString", () => {
    it("parses valid 24-hour time strings correctly", () => {
      expect(parseTimeString("09:30")).toEqual({ hours: 9, minutes: 30 });
      expect(parseTimeString("14:00")).toEqual({ hours: 14, minutes: 0 });
      expect(parseTimeString("00:00")).toEqual({ hours: 0, minutes: 0 });
      expect(parseTimeString("23:59")).toEqual({ hours: 23, minutes: 59 });
    });

    it("parses 12-hour AM/PM time strings correctly", () => {
      expect(parseTimeString("9:30 AM")).toEqual({ hours: 9, minutes: 30 });
      expect(parseTimeString("1:15 pm")).toEqual({ hours: 13, minutes: 15 });
      expect(parseTimeString("12:00 am")).toEqual({ hours: 0, minutes: 0 });
      expect(parseTimeString("12:30 pm")).toEqual({ hours: 12, minutes: 30 });
    });

    it("returns null for malformed or out-of-range strings", () => {
      expect(parseTimeString("25:00")).toBeNull();
      expect(parseTimeString("12:65")).toBeNull();
      expect(parseTimeString("invalid")).toBeNull();
      expect(parseTimeString("")).toBeNull();
      expect(parseTimeString("99:99")).toBeNull();
    });
  });

  describe("formatSpokenTime", () => {
    it("converts 24-hour time into spoken AM/PM format", () => {
      expect(formatSpokenTime("09:30")).toBe("9:30 AM");
      expect(formatSpokenTime("14:00")).toBe("2 PM");
      expect(formatSpokenTime("12:00")).toBe("12 PM");
      expect(formatSpokenTime("00:15")).toBe("12:15 AM");
    });
  });

  describe("getNextClass", () => {
    const sampleTimetable: TimetableEntry[] = [
      {
        id: "1",
        courseCode: "CS201",
        courseName: "Data Structures",
        room: "Room 204",
        building: "Turing Hall",
        dayOfWeek: 1, // Monday
        startTime: "10:00",
        endTime: "11:30",
      },
      {
        id: "2",
        courseCode: "MATH210",
        courseName: "Linear Algebra",
        room: "Hall B",
        building: "Newton Center",
        dayOfWeek: 1, // Monday
        startTime: "14:00",
        endTime: "15:30",
      },
      {
        id: "3",
        courseCode: "ENG102",
        courseName: "Technical Writing",
        room: "Room 105",
        dayOfWeek: 3, // Wednesday
        startTime: "09:00",
        endTime: "10:30",
      },
    ];

    it("detects class in progress and calculates time remaining", () => {
      // Monday at 10:45 AM (during CS201 10:00 - 11:30)
      const refDate = new Date(2026, 9, 26, 10, 45); // Day 1 = Monday
      const result = getNextClass(sampleTimetable, refDate);

      expect(result.status).toBe("in_progress");
      expect(result.entry?.courseCode).toBe("CS201");
      expect(result.minutesUntilEnd).toBe(45);
      expect(result.spokenDescription).toContain("currently have CS201");
      expect(result.spokenDescription).toContain("ends in 45 minutes");
    });

    it("identifies next class upcoming later the same day", () => {
      // Monday at 12:00 PM (before MATH210 at 14:00)
      const refDate = new Date(2026, 9, 26, 12, 0);
      const result = getNextClass(sampleTimetable, refDate);

      expect(result.status).toBe("upcoming");
      expect(result.entry?.courseCode).toBe("MATH210");
      expect(result.minutesUntilStart).toBe(120);
      expect(result.isToday).toBe(true);
      expect(result.spokenDescription).toContain("MATH210 Linear Algebra");
      expect(result.spokenDescription).toContain("Hall B in Newton Center");
      expect(result.spokenDescription).toContain("2 hour");
    });

    it("identifies next class on a subsequent day (Monday evening -> Wednesday)", () => {
      // Monday at 16:00 (all Monday classes finished)
      const refDate = new Date(2026, 9, 26, 16, 0);
      const result = getNextClass(sampleTimetable, refDate);

      expect(result.status).toBe("upcoming");
      expect(result.entry?.courseCode).toBe("ENG102");
      expect(result.isToday).toBe(false);
      expect(result.dayName).toBe("Wednesday");
      expect(result.spokenDescription).toContain("Wednesday");
      expect(result.spokenDescription).toContain("Room 105");
    });

    it("handles weekend wrap-around (Saturday -> Monday morning)", () => {
      // Saturday at 11:00 AM (Day 6)
      const refDate = new Date(2026, 9, 24, 11, 0); // Saturday
      const result = getNextClass(sampleTimetable, refDate);

      expect(result.status).toBe("upcoming");
      expect(result.entry?.courseCode).toBe("CS201");
      expect(result.isToday).toBe(false);
      expect(result.dayName).toBe("Monday");
      expect(result.spokenDescription).toContain("Monday at 10 AM");
    });

    it("returns friendly status when timetable is empty", () => {
      const result = getNextClass([]);
      expect(result.status).toBe("none");
      expect(result.entry).toBeNull();
      expect(result.spokenDescription).toContain("no classes configured");
    });

    it("ignores malformed timetable entries gracefully", () => {
      const badTimetable: TimetableEntry[] = [
        {
          id: "bad",
          courseCode: "BAD101",
          courseName: "Broken Course",
          room: "Nowhere",
          dayOfWeek: 1,
          startTime: "invalid",
          endTime: "invalid",
        },
      ];
      const result = getNextClass(badTimetable, new Date());
      expect(result.status).toBe("none");
      expect(result.entry).toBeNull();
    });
  });
});
