import { describe, expect, it } from "vitest";
import {
  buildEditedTimeEntryPayload,
  buildNewTimeEntryPayload,
} from "./timeEntryPayload.js";

describe("time entry payload helpers", () => {
  it("builds a normal new time entry", () => {
    const payload = buildNewTimeEntryPayload({
      date: "2026-06-17",
      projectId: "project-1",
      fromMin: 420,
      toMin: 960,
      breakMin: 30,
      travelMin: 45,
      note: "  Fundament betoniert  ",
    });

    expect(payload).toMatchObject({
      work_date: "2026-06-17",
      project_id: "project-1",
      start_min: 420,
      end_min: 960,
      break_min: 30,
      travel_minutes: 45,
      travel_cost_center: "FAHRZEIT",
      voice_note: "Fundament betoniert",
      note: "Fundament betoniert",
      bad_weather: false,
      bad_weather_minutes: 0,
    });
  });

  it("adds the absence prefix and clears disabled extras", () => {
    const payload = buildNewTimeEntryPayload({
      date: "2026-06-17",
      projectId: null,
      fromMin: 420,
      toMin: 900,
      breakMin: 0,
      travelMin: 0,
      absenceType: "krank",
      craneUsed: false,
      craneHours: 5,
      privatePkwUsed: false,
      privatePkwKm: 42,
      note: "Arzttermin",
    });

    expect(payload).toMatchObject({
      project_id: null,
      absence_type: "krank",
      crane_hours: 0,
      private_pkw_km: 0,
      note: "[Krank] Arzttermin",
    });
  });

  it("adds a special leave prefix", () => {
    const payload = buildNewTimeEntryPayload({
      date: "2026-06-17",
      projectId: null,
      fromMin: 420,
      toMin: 435,
      breakMin: 15,
      travelMin: 0,
      absenceType: "sonderurlaub",
      note: "Hochzeit",
    });

    expect(payload).toMatchObject({
      absence_type: "sonderurlaub",
      note: "[Sonderurlaub] Hochzeit",
    });
  });

  it("calculates bad weather minutes without going below zero", () => {
    const payload = buildNewTimeEntryPayload({
      fromMin: 480,
      toMin: 500,
      breakMin: 30,
      badWeather: true,
      note: "",
    });

    expect(payload.bad_weather_minutes).toBe(0);
    expect(payload.note).toBe("[Schlechtwetter]");
  });

  it("normalizes edited integer and decimal values", () => {
    const payload = buildEditedTimeEntryPayload({
      fromMin: 420,
      toMin: 960,
      editState: {
        project_id: "project-1",
        break_min: "30",
        travel_minutes: "45",
        crane_hours: "2",
        private_pkw_km: "12,5",
        za_hours: "1,5",
        bad_weather: true,
        weather_manual: " Regen ",
        weather_auto: "Sonnig",
        note: "  Baustelle gesichert  ",
      },
    });

    expect(payload).toMatchObject({
      break_min: 30,
      travel_minutes: 45,
      crane_hours: 2,
      private_pkw_km: 12.5,
      za_hours: 1.5,
      bad_weather_minutes: 510,
      weather_manual: "Regen",
      weather_final: "Regen",
      voice_note: "Baustelle gesichert",
      note: "Baustelle gesichert",
    });
  });
});
