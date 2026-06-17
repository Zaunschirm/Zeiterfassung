const trimmedOrNull = (value) => String(value || "").trim() || null;

const integerOrZero = (value) => parseInt(value || "0", 10) || 0;

const decimalOrZero = (value) =>
  Number(String(value ?? 0).replace(",", ".")) || 0;

const getNotePrefix = ({ absenceType, zaUsed, badWeather }) => {
  if (absenceType === "krank") return "[Krank] ";
  if (absenceType === "urlaub") return "[Urlaub] ";
  if (zaUsed) return "[Zeitausgleich] ";
  if (badWeather) return "[Schlechtwetter] ";
  return "";
};

export function buildNewTimeEntryPayload({
  date,
  projectId,
  fromMin,
  toMin,
  breakMin,
  travelMin,
  weatherAuto,
  weatherManual,
  finalWeather,
  weatherCode,
  temperature,
  precipitation,
  weatherSource,
  weatherFetchedAt,
  craneUsed,
  craneHours,
  privatePkwUsed,
  privatePkwKm,
  zaUsed,
  zaHours,
  badWeather,
  note,
  absenceType,
}) {
  const cleanNote = String(note || "").trim();

  return {
    work_date: date,
    project_id: projectId || null,
    start_min: fromMin,
    end_min: toMin,
    break_min: breakMin,
    travel_minutes: travelMin,
    travel_cost_center: "FAHRZEIT",
    weather_auto: weatherAuto || null,
    weather_manual: weatherManual || null,
    weather_final: finalWeather || null,
    weather_code: weatherCode,
    temperature,
    precipitation,
    weather_source: weatherSource || null,
    weather_fetched_at: weatherFetchedAt || null,
    crane_hours: craneUsed ? Number(craneHours || 0) : 0,
    private_pkw_km: privatePkwUsed ? Number(privatePkwKm || 0) : 0,
    za_hours: zaUsed ? Number(zaHours || 0) : 0,
    bad_weather: !!badWeather,
    bad_weather_minutes: badWeather
      ? Math.max(toMin - fromMin - breakMin, 0)
      : 0,
    voice_note: cleanNote || null,
    note:
      `${getNotePrefix({ absenceType, zaUsed, badWeather })}${cleanNote}`.trim() ||
      null,
  };
}

export function buildEditedTimeEntryPayload({ editState, fromMin, toMin }) {
  const breakMin = integerOrZero(editState.break_min);
  const cleanNote = trimmedOrNull(editState.note);

  return {
    project_id: editState.project_id || null,
    start_min: fromMin,
    end_min: toMin,
    break_min: breakMin,
    travel_minutes: integerOrZero(editState.travel_minutes),
    crane_hours: integerOrZero(editState.crane_hours),
    private_pkw_km: decimalOrZero(editState.private_pkw_km),
    za_hours: decimalOrZero(editState.za_hours),
    bad_weather: !!editState.bad_weather,
    bad_weather_minutes: editState.bad_weather
      ? Math.max(toMin - fromMin - breakMin, 0)
      : 0,
    voice_note: cleanNote,
    weather_manual: trimmedOrNull(editState.weather_manual),
    weather_final:
      String(editState.weather_manual || "").trim() ||
      editState.weather_auto ||
      null,
    note: cleanNote,
  };
}
