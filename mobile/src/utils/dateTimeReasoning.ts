/**
 * Deterministic Date/Time Reasoning Engine for Saarthi Campus Mode.
 *
 * Safety Rule 3: Models EXTRACT raw observations/text; deterministic plain code REASONS.
 * Zero date/time speculation by LLM.
 */

export interface TimetableEntry {
  id: string;
  courseCode: string;
  courseName: string;
  room: string;
  building?: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string; // "HH:mm" 24-hour format
  endTime: string;   // "HH:mm" 24-hour format
  instructor?: string;
}

export type ClassStatus = "upcoming" | "in_progress" | "none";

export interface NextClassResult {
  status: ClassStatus;
  entry: TimetableEntry | null;
  spokenDescription: string;
  minutesUntilStart?: number;
  minutesUntilEnd?: number;
  isToday: boolean;
  dayName?: string;
}

export interface ParsedEventDate {
  rawText: string;
  eventTitle: string;
  daysRemaining: number | null;
  isExpired: boolean;
  spokenSummary: string;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Parses a 24-hour time string ("HH:mm" or "H:mm") or 12-hour AM/PM into hours and minutes.
 */
export function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  if (!timeStr || typeof timeStr !== "string") return null;

  const trimmed = timeStr.trim().toLowerCase();

  // Handle 12-hour AM/PM formats e.g. "9:30 AM", "2:15 pm"
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const isPm = ampmMatch[3] === "pm";

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (isPm && hours !== 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
    return { hours, minutes };
  }

  // Handle 24-hour formats e.g. "09:30", "14:15"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match24) return null;

  const hours = parseInt(match24[1], 10);
  const minutes = parseInt(match24[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

/**
 * Formats a 24-hour time string into a human-friendly spoken string (e.g. "9:30 AM").
 */
export function formatSpokenTime(timeStr: string): string {
  const parsed = parseTimeString(timeStr);
  if (!parsed) return timeStr;

  const { hours, minutes } = parsed;
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutes = minutes === 0 ? "" : `:${minutes.toString().padStart(2, "0")}`;
  return `${displayHours}${displayMinutes} ${ampm}`;
}

/**
 * Deterministically computes the next class or active class from the student's timetable.
 *
 * @param timetable List of scheduled classes.
 * @param referenceDate Optional current date (defaults to new Date()).
 */
export function getNextClass(
  timetable: TimetableEntry[],
  referenceDate: Date = new Date()
): NextClassResult {
  if (!timetable || timetable.length === 0) {
    return {
      status: "none",
      entry: null,
      spokenDescription: "You have no classes configured in your timetable.",
      isToday: false,
    };
  }

  const currentDay = referenceDate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const currentHours = referenceDate.getHours();
  const currentMinutes = referenceDate.getMinutes();
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  // 1. Check for a class currently IN PROGRESS today
  for (const entry of timetable) {
    if (entry.dayOfWeek === currentDay) {
      const start = parseTimeString(entry.startTime);
      const end = parseTimeString(entry.endTime);

      if (start && end) {
        const startMin = start.hours * 60 + start.minutes;
        const endMin = end.hours * 60 + end.minutes;

        if (currentTotalMinutes >= startMin && currentTotalMinutes < endMin) {
          const remainingMin = endMin - currentTotalMinutes;
          const location = entry.building
            ? `${entry.room} in ${entry.building}`
            : entry.room;
          return {
            status: "in_progress",
            entry,
            spokenDescription: `You currently have ${entry.courseCode} ${entry.courseName} in ${location}. It ends in ${remainingMin} minutes.`,
            minutesUntilEnd: remainingMin,
            isToday: true,
            dayName: DAY_NAMES[currentDay],
          };
        }
      }
    }
  }

  // 2. Find upcoming classes across the next 7 days
  interface Candidate {
    entry: TimetableEntry;
    daysAhead: number;
    minutesUntilStart: number;
    startTotalMin: number;
  }

  const candidates: Candidate[] = [];

  for (const entry of timetable) {
    const start = parseTimeString(entry.startTime);
    if (!start) continue;

    const startTotalMin = start.hours * 60 + start.minutes;
    let daysAhead = (entry.dayOfWeek - currentDay + 7) % 7;

    // If it's today but start time has already passed, it will be next week
    if (daysAhead === 0 && startTotalMin <= currentTotalMinutes) {
      daysAhead = 7;
    }

    const minutesUntilStart = daysAhead * 24 * 60 + (startTotalMin - currentTotalMinutes);
    candidates.push({
      entry,
      daysAhead,
      minutesUntilStart,
      startTotalMin,
    });
  }

  if (candidates.length === 0) {
    return {
      status: "none",
      entry: null,
      spokenDescription: "Could not calculate upcoming classes due to invalid time entries.",
      isToday: false,
    };
  }

  // Sort by earliest start time
  candidates.sort((a, b) => a.minutesUntilStart - b.minutesUntilStart);
  const next = candidates[0];
  const nextEntry = next.entry;
  const isToday = next.daysAhead === 0;
  const isTomorrow = next.daysAhead === 1;
  const location = nextEntry.building
    ? `${nextEntry.room} in ${nextEntry.building}`
    : nextEntry.room;
  const spokenTime = formatSpokenTime(nextEntry.startTime);

  let timingText: string;
  if (isToday) {
    const hours = Math.floor(next.minutesUntilStart / 60);
    const mins = next.minutesUntilStart % 60;
    if (hours === 0) {
      timingText = `today in ${mins} minute${mins === 1 ? "" : "s"} at ${spokenTime}`;
    } else {
      timingText = `today at ${spokenTime}, in ${hours} hour${hours === 1 ? "" : "s"} and ${mins} minute${mins === 1 ? "" : "s"}`;
    }
  } else if (isTomorrow) {
    timingText = `tomorrow at ${spokenTime}`;
  } else {
    timingText = `on ${DAY_NAMES[nextEntry.dayOfWeek]} at ${spokenTime}`;
  }

  const spoken = `Your next class is ${nextEntry.courseCode} ${nextEntry.courseName} in ${location}, ${timingText}.`;

  return {
    status: "upcoming",
    entry: nextEntry,
    spokenDescription: spoken,
    minutesUntilStart: next.minutesUntilStart,
    isToday,
    dayName: DAY_NAMES[nextEntry.dayOfWeek],
  };
}
