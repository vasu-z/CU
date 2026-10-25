import { describe, it, expect } from "@jest/globals";
import { parseVoiceCommand } from "./voiceCommands";

describe("voiceCommands — Deterministic Intent Parsing", () => {
  it("parses 'Read this.' intent correctly", () => {
    expect(parseVoiceCommand("Read this.").intent).toBe("read_this");
    expect(parseVoiceCommand("read the sign").intent).toBe("read_this");
    expect(parseVoiceCommand("read noticeboard!").intent).toBe("read_this");
  });

  it("parses specific reading modes for timetable, room number, and notice", () => {
    const timetableCmd = parseVoiceCommand("Read the timetable.");
    expect(timetableCmd.intent).toBe("read_this");
    expect(timetableCmd.readingMode).toBe("timetable");

    const signCmd = parseVoiceCommand("Read this room number.");
    expect(signCmd.intent).toBe("read_this");
    expect(signCmd.readingMode).toBe("sign");

    const noticeCmd = parseVoiceCommand("Summarize this notice.");
    expect(noticeCmd.intent).toBe("read_this");
    expect(noticeCmd.readingMode).toBe("notice");
  });

  it("parses 'What is ahead?' intent correctly", () => {
    expect(parseVoiceCommand("What is ahead?").intent).toBe("what_is_ahead");
    expect(parseVoiceCommand("what's ahead").intent).toBe("what_is_ahead");
    expect(parseVoiceCommand("what do you see in front of me").intent).toBe("what_is_ahead");
  });

  it("parses 'Where am I?' intent correctly", () => {
    expect(parseVoiceCommand("Where am I?").intent).toBe("where_am_i");
    expect(parseVoiceCommand("what room is this?").intent).toBe("where_am_i");
    expect(parseVoiceCommand("my location").intent).toBe("where_am_i");
  });

  it("parses 'When is my next class?' intent correctly", () => {
    expect(parseVoiceCommand("When is my next class?").intent).toBe("next_class");
    expect(parseVoiceCommand("next class").intent).toBe("next_class");
    expect(parseVoiceCommand("what class is next?").intent).toBe("next_class");
  });

  it("parses 'Take me to <place>' intent correctly extracting destination query", () => {
    const res1 = parseVoiceCommand("Take me to the library.");
    expect(res1.intent).toBe("navigate_to");
    expect(res1.destinationQuery).toBe("library");

    const res2 = parseVoiceCommand("Take me to Room 204");
    expect(res2.intent).toBe("navigate_to");
    expect(res2.destinationQuery).toBe("room 204");

    const res3 = parseVoiceCommand("directions to science center");
    expect(res3.intent).toBe("navigate_to");
    expect(res3.destinationQuery).toBe("science center");
  });

  it("parses 'Repeat.' intent correctly", () => {
    expect(parseVoiceCommand("Repeat.").intent).toBe("repeat");
    expect(parseVoiceCommand("repeat instruction").intent).toBe("repeat");
    expect(parseVoiceCommand("say again").intent).toBe("repeat");
  });

  it("parses 'Stop.' intent correctly", () => {
    expect(parseVoiceCommand("Stop.").intent).toBe("stop");
    expect(parseVoiceCommand("stop speaking").intent).toBe("stop");
    expect(parseVoiceCommand("cancel").intent).toBe("stop");
  });

  it("handles unknown commands gracefully", () => {
    const res = parseVoiceCommand("Tell me a funny joke");
    expect(res.intent).toBe("unknown");
    expect(res.confidence).toBeLessThan(0.5);
  });
});
