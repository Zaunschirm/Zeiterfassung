const WEATHER_LABELS = {
  0: "Sonnig",
  1: "Überwiegend sonnig",
  2: "Teilweise bewölkt",
  3: "Bewölkt",
  45: "Nebelig",
  48: "Raureifnebel",
  51: "Leichter Nieselregen",
  53: "Nieselregen",
  55: "Starker Nieselregen",
  56: "Leichter gefrierender Nieselregen",
  57: "Gefrierender Nieselregen",
  61: "Leichter Regen",
  63: "Regen",
  65: "Starker Regen",
  66: "Leichter gefrierender Regen",
  67: "Gefrierender Regen",
  71: "Leichter Schneefall",
  73: "Schneefall",
  75: "Starker Schneefall",
  77: "Schneegriesel",
  80: "Regenschauer",
  81: "Regenschauer",
  82: "Starke Regenschauer",
  85: "Schneeschauer",
  86: "Starke Schneeschauer",
  95: "Gewitter",
  96: "Gewitter mit Hagel",
  99: "Starkes Gewitter mit Hagel",
};

export const WEATHER_MANUAL_OPTIONS = [
  "Automatisch",
  "Sonnig",
  "Überwiegend sonnig",
  "Teilweise bewölkt",
  "Bewölkt",
  "Nebelig",
  "Leichter Regen",
  "Regen",
  "Starker Regen",
  "Schneefall",
  "Regenschauer",
  "Gewitter",
  "Windig",
  "Trocken",
  "Sonstiges",
];

const GEOCODE_CACHE_KEY = "hbz_project_geocode_cache_v2";

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function normalizeAddress(input) {
  return String(input || "")
    .replace(/\bSt\.\b/g, "Sankt")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function buildAddressVariants(address) {
  const cleaned = normalizeAddress(address);
  if (!cleaned) return [];

  const variants = new Set();
  variants.add(cleaned);

  const parts = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const first = parts[0] || "";
  const rest = parts.slice(1).join(", ").trim();

  // Hausnummer entfernen
  const firstWithoutNumber = first.replace(/\s+\d+[a-zA-Z/-]*\b/g, "").trim();

  if (firstWithoutNumber && rest) {
    variants.add(`${firstWithoutNumber}, ${rest}`);
  }

  // Nur PLZ + Ort
  const zipCityMatch = cleaned.match(/\b\d{4,5}\s+[^,]+/);
  if (zipCityMatch?.[0]) {
    variants.add(zipCityMatch[0].trim());
  }

  // Nur letzter Teil nach Komma
  if (parts.length >= 2) {
    variants.add(parts[parts.length - 1]);
  }

  // Nur Ort ohne PLZ
  if (zipCityMatch?.[0]) {
    const cityOnly = zipCityMatch[0].replace(/\b\d{4,5}\s+/, "").trim();
    if (cityOnly) variants.add(cityOnly);
  }

  return [...variants].filter(Boolean);
}

function pickBestGeocode(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const preferred = [...results].sort((a, b) => {
    const aRank = String(a.country_code || "").toUpperCase() === "AT" ? 0 : 1;
    const bRank = String(b.country_code || "").toUpperCase() === "AT" ? 0 : 1;

    const aPop = Number(a.population || 0);
    const bPop = Number(b.population || 0);

    if (aRank !== bRank) return aRank - bRank;
    return bPop - aPop;
  });

  return preferred[0] || null;
}

export function weatherCodeToLabel(code) {
  if (code === null || typeof code === "undefined" || code === "") return "";
  return WEATHER_LABELS[Number(code)] || `Wettercode ${code}`;
}

export function getWeatherFinalLabel(entry) {
  if (entry?.weather_manual) return entry.weather_manual;
  if (entry?.weather_final) return entry.weather_final;
  if (entry?.weather_auto) return entry.weather_auto;
  if (typeof entry?.weather_code !== "undefined" && entry?.weather_code !== null) {
    return weatherCodeToLabel(entry.weather_code);
  }
  return "";
}

async function geocodeOne(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=10&language=de&format=json`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geocoding fehlgeschlagen (${res.status})`);
  }

  const json = await res.json();
  return pickBestGeocode(json?.results || []);
}

async function geocodeAddress(address) {
  const cleanAddress = normalizeAddress(address);
  if (!cleanAddress) return null;

  const cache = readCache();
  if (cache[cleanAddress]) return cache[cleanAddress];

  const variants = buildAddressVariants(cleanAddress);

  for (const variant of variants) {
    try {
      const best = await geocodeOne(variant);
      if (best?.latitude && best?.longitude) {
        const result = {
          latitude: best.latitude,
          longitude: best.longitude,
          name: best.name || variant,
          admin1: best.admin1 || "",
          country_code: best.country_code || "",
          resolved_from: variant,
        };

        cache[cleanAddress] = result;
        writeCache(cache);
        return result;
      }
    } catch (err) {
      console.warn("[weather] Geocoding-Variante fehlgeschlagen:", variant, err);
    }
  }

  return null;
}

function buildWeatherUrl({ latitude, longitude, date }) {
  const today = new Date();
  const requested = new Date(`${date}T12:00:00`);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const isPast = requested < todayStart;

  const base = isPast
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: date,
    end_date: date,
    hourly: "weather_code,temperature_2m,precipitation",
    timezone: "auto",
  });

  return `${base}?${params.toString()}`;
}

function pickHourlyIndex(hourly = {}, midpointHour = 12) {
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  if (!times.length) return -1;

  let bestIdx = 0;
  let bestDiff = Number.POSITIVE_INFINITY;

  times.forEach((t, idx) => {
    const hour = Number(String(t).slice(11, 13));
    const diff = Math.abs(hour - midpointHour);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = idx;
    }
  });

  return bestIdx;
}

export async function fetchWeatherForBooking({ address, date, startMin, endMin }) {
  const cleanAddress = normalizeAddress(address);

  if (!cleanAddress) {
    return {
      ok: false,
      reason: "no-address",
      weather_auto: "",
      weather_final: "",
      temperature: null,
      precipitation: null,
      weather_code: null,
      weather_source: "manual",
    };
  }

  const geo = await geocodeAddress(cleanAddress);

  if (!geo || typeof geo.latitude !== "number" || typeof geo.longitude !== "number") {
    return {
      ok: false,
      reason: "geocode-not-found",
      weather_auto: "",
      weather_final: "",
      temperature: null,
      precipitation: null,
      weather_code: null,
      weather_source: "manual",
    };
  }

  const midpointMin = Math.round(
    ((Number(startMin) || 0) + (Number(endMin) || 0)) / 2
  );
  const midpointHour = Math.max(0, Math.min(23, Math.round(midpointMin / 60)));

  const url = buildWeatherUrl({
    latitude: geo.latitude,
    longitude: geo.longitude,
    date,
  });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Wetter konnte nicht geladen werden (${res.status})`);
  }

  const json = await res.json();
  const idx = pickHourlyIndex(json?.hourly || {}, midpointHour);

  const weatherCode =
    idx >= 0 && Array.isArray(json?.hourly?.weather_code)
      ? json.hourly.weather_code[idx]
      : null;

  const temperature =
    idx >= 0 && Array.isArray(json?.hourly?.temperature_2m)
      ? json.hourly.temperature_2m[idx]
      : null;

  const precipitation =
    idx >= 0 && Array.isArray(json?.hourly?.precipitation)
      ? json.hourly.precipitation[idx]
      : null;

  const weather_auto = weatherCodeToLabel(weatherCode);

  return {
    ok: true,
    latitude: geo.latitude,
    longitude: geo.longitude,
    resolved_address: [geo.name, geo.admin1].filter(Boolean).join(", "),
    weather_auto,
    weather_final: weather_auto,
    weather_code: weatherCode,
    temperature,
    precipitation,
    weather_source: "open-meteo",
    weather_fetched_at: new Date().toISOString(),
  };
}