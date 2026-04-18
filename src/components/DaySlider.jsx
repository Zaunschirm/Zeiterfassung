import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import EmployeePicker from "./EmployeePicker.jsx";
import {
  WEATHER_MANUAL_OPTIONS,
  fetchWeatherForBooking,
  getWeatherFinalLabel,
} from "../utils/weather";

// Utils
const toHM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(
    2,
    "0"
  )}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hmToMin = (hm) => {
  if (!hm) return 0;
  const [h, m] = String(hm).split(":").map((x) => parseInt(x || "0", 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};
const h2 = (m) => Math.round((m / 60) * 100) / 100;
const formatTravelLabel = (m) => {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")} h`;
  return `${m} min`;
};

const formatTemp = (value) =>
  typeof value === "number" && !Number.isNaN(value) ? `${value.toFixed(1)} °C` : "—";

const formatPrecip = (value) =>
  typeof value === "number" && !Number.isNaN(value) ? `${value.toFixed(1)} mm` : "—";


const PAUSE_OPTIONS = [0, 15, 30, 45, 60, 75, 90];
const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150];

const BUAK_WEEK_TYPES_2026 = {
  1: "K",
  2: "K",
  3: "L",
  4: "K",
  5: "L",
  6: "K",
  7: "L",
  8: "K",
  9: "L",
  10: "K",
  11: "L",
  12: "K",
  13: "L",
  14: "K",
  15: "L",
  16: "L",
  17: "K",
  18: "L",
  19: "L",
  20: "K",
  21: "K",
  22: "L",
  23: "K",
  24: "L",
  25: "K",
  26: "L",
  27: "K",
  28: "L",
  29: "K",
  30: "L",
  31: "K",
  32: "L",
  33: "K",
  34: "L",
  35: "K",
  36: "L",
  37: "K",
  38: "L",
  39: "K",
  40: "L",
  41: "K",
  42: "L",
  43: "K",
  44: "L",
  45: "K",
  46: "L",
  47: "K",
  48: "L",
  49: "K",
  50: "K",
  51: "K",
  52: "L",
  53: "L",
};

function isoWeekNumber(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;

  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);

  return 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

function getBuakWeekLabel(dateStr) {
  try {
    if (!dateStr) return "";
    const wk = isoWeekNumber(String(dateStr).slice(0, 10));
    if (!wk) return "";
    const year = Number(String(dateStr).slice(0, 4));
    if (year !== 2026) return `KW ${wk}`;
    const t = BUAK_WEEK_TYPES_2026[wk];
    if (t === "K") return `KW ${wk} - Kurze Woche`;
    if (t === "L") return `KW ${wk} - Lange Woche`;
    return `KW ${wk}`;
  } catch {
    return "";
  }
}

const logSbError = (prefix, error) =>
  console.error(prefix, error?.message || error);

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekDays(dateStr, count = 5) {
  const start = startOfWeek(dateStr);
  return Array.from({ length: count }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return d.toISOString().slice(0, 10);
  });
}

export default function DaySlider() {
  const session = getSession()?.user || null;
  const role = (session?.role || "mitarbeiter").toLowerCase();
  const isStaff = role === "mitarbeiter";
  const isManager = !isStaff;

  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const buakWeekLabel = getBuakWeekLabel(date);

  const [fromMin, setFromMin] = useState(7 * 60);
  const [toMin, setToMin] = useState(16 * 60 + 30);
  const [breakMin, setBreakMin] = useState(30);
  const [travelMin, setTravelMin] = useState(0);
  const [note, setNote] = useState("");
  const [weatherAuto, setWeatherAuto] = useState("");
  const [weatherManual, setWeatherManual] = useState("");
  const [weatherCode, setWeatherCode] = useState(null);
  const [temperature, setTemperature] = useState(null);
  const [precipitation, setPrecipitation] = useState(null);
  const [weatherSource, setWeatherSource] = useState("");
  const [weatherFetchedAt, setWeatherFetchedAt] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const [absenceType, setAbsenceType] = useState(null);

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [projectLoadNote, setProjectLoadNote] = useState(null);
  const [assignmentSuggestions, setAssignmentSuggestions] = useState([]);
  const [assignmentInfo, setAssignmentInfo] = useState("");

  const [employees, setEmployees] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState(
    session?.code ? [session.code] : []
  );
  const [employeeRow, setEmployeeRow] = useState(null);

  const [entries, setEntries] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editState, setEditState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    async function loadProjects() {
      try {
        const tryList = async (source) => {
          const { data, error } = await supabase
            .from(source)
            .select("*")
            .order("name", { ascending: true });
          if (error) return { ok: false, data: [] };
          return { ok: true, data: data || [] };
        };

        let res = await tryList("projects");
        if (!res.ok || res.data.length === 0) {
          for (const fb of ["v_projects", "projects_view", "projects_all"]) {
            const r = await tryList(fb);
            if (r.ok && r.data.length > 0) {
              res = r;
              break;
            }
          }
        }

        if (!res.ok) {
          setProjects([]);
          setProjectLoadNote(
            "Projekte konnten nicht geladen werden. Siehe Konsole."
          );
          return;
        }

        const list = (res.data || []).filter(
          (p) => p?.disabled !== true && p?.active !== false
        );
        setProjects(list);
        if (!projectId && list.length === 1) {
          setProjectId(list[0].id);
        }
      } catch (e) {
        logSbError("[DaySlider] projects load error:", e);
        setProjectLoadNote(
          "Projekte konnten nicht geladen werden (Fehler, siehe Konsole)."
        );
      }
    }

    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadEmployees() {
      try {
        if (isManager) {
          const { data, error } = await supabase
            .from("employees")
            .select("id, code, name, role, active, disabled")
            .eq("active", true)
            .eq("disabled", false)
            .order("name", { ascending: true });

          if (error) throw error;
          const list = data || [];
          setEmployees(list);

          if (session?.code) {
            const me = list.find((e) => e.code === session.code);
            if (me) {
              setSelectedCodes([me.code]);
              setEmployeeRow(me);
            } else if (!selectedCodes.length) {
              setSelectedCodes([]);
            }
          } else if (!selectedCodes.length) {
            setSelectedCodes([]);
          }
        } else {
          const { data, error } = await supabase
            .from("employees")
            .select("id, code, name, role, active, disabled")
            .eq("code", session?.code)
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          if (data) {
            setEmployees([data]);
            setSelectedCodes([data.code]);
            setEmployeeRow(data);
          }
        }
      } catch (e) {
        logSbError("[DaySlider] employees load error:", e);
      }
    }

    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, session?.code]);

  useEffect(() => {
    if (!isStaff) return;
    if (!session?.code) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("employees")
          .select("id, code, name, role, active, disabled")
          .eq("code", session.code)
          .limit(1)
          .maybeSingle();
        if (!error && data) setEmployeeRow(data);
      } catch (e) {
        logSbError("[DaySlider] employeeRow load error:", e);
      }
    })();
  }, [isStaff, session?.code]);

  const totalMin = useMemo(() => {
    const raw = clamp(toMin - fromMin, 0, 24 * 60);
    return clamp(raw - breakMin, 0, 24 * 60);
  }, [fromMin, toMin, breakMin]);

  const totalMinWithTravel = useMemo(
    () => totalMin + (travelMin || 0),
    [totalMin, travelMin]
  );

  const totalHours = useMemo(() => h2(totalMinWithTravel), [totalMinWithTravel]);
  const totalOvertime = useMemo(() => Math.max(totalHours - 9, 0), [totalHours]);
  const selectedProject = useMemo(
    () => projects.find((p) => String(p.id) === String(projectId)) || null,
    [projects, projectId]
  );
  const projectAddress = selectedProject?.address || "";
  const finalWeather = weatherManual || weatherAuto || "";

  async function loadWeatherForCurrentBooking(force = false) {
    if (absenceType === "krank" || absenceType === "urlaub") {
      setWeatherAuto("");
      setWeatherCode(null);
      setTemperature(null);
      setPrecipitation(null);
      setWeatherSource("");
      setWeatherFetchedAt(null);
      setWeatherError("");
      if (!weatherManual) setWeatherManual("");
      return;
    }

    if (!projectAddress) {
      setWeatherAuto("");
      setWeatherCode(null);
      setTemperature(null);
      setPrecipitation(null);
      setWeatherSource("");
      setWeatherFetchedAt(null);
      setWeatherError("Beim Projekt ist keine Baustellenadresse hinterlegt.");
      return;
    }

    try {
      setWeatherLoading(true);
      setWeatherError("");
      const weather = await fetchWeatherForBooking({
        address: projectAddress,
        date,
        startMin: fromMin,
        endMin: toMin,
      });

      if (!weather?.ok && !force) {
        setWeatherAuto("");
        setWeatherCode(null);
        setTemperature(null);
        setPrecipitation(null);
        setWeatherSource("");
        setWeatherFetchedAt(null);
        setWeatherError("Wetter konnte nicht automatisch geladen werden.");
        return;
      }

      setWeatherAuto(weather?.weather_auto || "");
      setWeatherCode(
        typeof weather?.weather_code !== "undefined" ? weather.weather_code : null
      );
      setTemperature(
        typeof weather?.temperature === "number" ? weather.temperature : null
      );
      setPrecipitation(
        typeof weather?.precipitation === "number" ? weather.precipitation : null
      );
      setWeatherSource(weather?.weather_source || "");
      setWeatherFetchedAt(weather?.weather_fetched_at || null);
    } catch (e) {
      logSbError("[DaySlider] weather load error:", e);
      setWeatherAuto("");
      setWeatherCode(null);
      setTemperature(null);
      setPrecipitation(null);
      setWeatherSource("");
      setWeatherFetchedAt(null);
      setWeatherError("Wetter konnte nicht geladen werden.");
    } finally {
      setWeatherLoading(false);
    }
  }

  useEffect(() => {
    if (!projectId || absenceType) return;
    loadWeatherForCurrentBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, date, fromMin, toMin, absenceType]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignmentSuggestions() {
      try {
        setAssignmentSuggestions([]);
        setAssignmentInfo("");

        const relevantIds = isManager
          ? employees
              .filter((e) => selectedCodes.includes(e.code))
              .map((e) => e.id)
          : employeeRow?.id
          ? [employeeRow.id]
          : [];

        if (!date || relevantIds.length === 0) return;

        const weekDates = getWeekDays(date);
        const { data, error } = await supabase
          .from("work_assignments")
          .select("assignment_date, employee_id, project_id, projects(id, name, code)")
          .in("employee_id", relevantIds)
          .in("assignment_date", weekDates);

        if (error) throw error;

        const todayRows = (data || []).filter((row) => row.assignment_date === date);

        const uniqueProjects = [];
        const seen = new Set();
        for (const row of todayRows) {
          const prj = row.projects || null;
          const id = prj?.id || row.project_id;
          if (!id || seen.has(String(id))) continue;
          seen.add(String(id));
          uniqueProjects.push({
            id,
            name: prj?.name || projects.find((p) => String(p.id) === String(id))?.name || `Projekt ${id}`,
            code: prj?.code || projects.find((p) => String(p.id) === String(id))?.code || "",
          });
        }

        if (cancelled) return;

        setAssignmentSuggestions(uniqueProjects);

        if (todayRows.length > 0) {
          const persons = new Set(todayRows.map((row) => row.employee_id)).size;
          setAssignmentInfo(
            persons > 1
              ? `Arbeitseinteilung gefunden: ${uniqueProjects.length} Projekt${uniqueProjects.length === 1 ? "" : "e"} für ${persons} Mitarbeiter.`
              : `Arbeitseinteilung gefunden: ${uniqueProjects.length} Projekt${uniqueProjects.length === 1 ? "" : "e"} für diesen Tag.`
          );
        }

        if (!absenceType && !projectId && uniqueProjects.length > 0) {
          setProjectId(uniqueProjects[0].id);
        }
      } catch (e) {
        logSbError("[DaySlider] work assignments load error:", e);
      }
    }

    loadAssignmentSuggestions();

    return () => {
      cancelled = true;
    };
  }, [date, isManager, selectedCodes, employeeRow?.id, employees, projects, absenceType]);

  async function loadEntries() {
    try {
      setLoading(true);
      let query = supabase
        .from("v_time_entries_expanded")
        .select("*")
        .eq("work_date", date)
        .order("employee_name", { ascending: true })
        .order("start_min", { ascending: true });

      if (isManager && selectedCodes.length) {
        const selEmps = employees.filter((e) =>
          selectedCodes.includes(e.code)
        );
        const ids = selEmps.map((e) => e.id);
        if (ids.length) query = query.in("employee_id", ids);
      } else if (isStaff && employeeRow?.id) {
        query = query.eq("employee_id", employeeRow.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries(data || []);
    } catch (e) {
      logSbError("[DaySlider] entries load error:", e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isManager, selectedCodes, employeeRow?.id]);

  const shiftDate = (days) => {
    setDate((old) => {
      const d = new Date(old);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    });
  };

  async function handleSave() {
    setError("");

    const isAbsence = absenceType === "krank" || absenceType === "urlaub";

    if (!isAbsence && !projectId) {
      setError("Bitte Projekt auswählen.");
      return;
    }

    const prj = projectId
      ? projects.find((p) => p.id === projectId) || null
      : null;

    if (projectId && !prj) {
      setError("Ungültiges Projekt.");
      return;
    }

    if (toMin <= fromMin) {
      setError("Ende muss nach Start liegen.");
      return;
    }

    const base = {
      work_date: date,
      project_id: prj ? prj.id : null,
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
      note: `${
        absenceType === "krank"
          ? "[Krank] "
          : absenceType === "urlaub"
          ? "[Urlaub] "
          : ""
      }${(note || "").trim()}`.trim() || null,
    };

    try {
      setSaving(true);

      if (isManager) {
        const chosen = employees.filter((e) =>
          selectedCodes.includes(e.code)
        );
        if (chosen.length === 0) {
          alert("Bitte mindestens einen Mitarbeiter auswählen.");
          return;
        }
        const rows = chosen.map((e) => ({ ...base, employee_id: e.id }));
        const { error } = await supabase.from("time_entries").insert(rows);
        if (error) throw error;
        alert(`Gespeichert für ${rows.length} Mitarbeiter.`);
      } else {
        if (!employeeRow) {
          alert("Mitarbeiterdaten konnten nicht geladen werden.");
          return;
        }
        if (employeeRow.code !== session.code) {
          alert("Nicht erlaubt: Mitarbeiter dürfen nur für sich buchen.");
          return;
        }
        const { error } = await supabase
          .from("time_entries")
          .insert({ ...base, employee_id: employeeRow.id });
        if (error) throw error;
        alert("Gespeichert.");
      }

      setNote("");
      setAbsenceType(null);
      setBreakMin(30);
      setTravelMin(0);
      setWeatherManual("");
      await loadEntries();
    } catch (err) {
      logSbError("save error:", err);
      alert("Speichern fehlgeschlagen. Siehe Konsole.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    if (!isManager) return;
    setEditId(row.id);
    setEditState({
      project_id: row.project_id,
      from_hm: toHM(row.start_min ?? row.from_min ?? 0),
      to_hm: toHM(row.end_min ?? row.to_min ?? 0),
      break_min: row.break_min ?? 0,
      travel_minutes: row.travel_minutes ?? row.travel_min ?? 0,
      weather_manual: row.weather_manual || "",
      weather_auto: row.weather_auto || "",
      weather_final: getWeatherFinalLabel(row),
      note: row.note || "",
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditState(null);
  }

  async function saveEdit() {
    if (!isManager || !editId || !editState) return;

    const from_m = hmToMin(editState.from_hm);
    const to_m = hmToMin(editState.to_hm);
    if (to_m <= from_m) {
      alert("Ende muss nach Start liegen.");
      return;
    }

    const upd = {
      project_id: editState.project_id || null,
      start_min: from_m,
      end_min: to_m,
      break_min: parseInt(editState.break_min || "0", 10) || 0,
      travel_minutes: parseInt(editState.travel_minutes || "0", 10) || 0,
      weather_manual: editState.weather_manual?.trim() || null,
      weather_final:
        (editState.weather_manual || "").trim() || editState.weather_auto || null,
      note: editState.note?.trim() || null,
    };

    try {
      const { error } = await supabase
        .from("time_entries")
        .update(upd)
        .eq("id", editId);
      if (error) throw error;
      await loadEntries();
      cancelEdit();
    } catch (e) {
      logSbError("saveEdit error:", e);
      alert("Änderung konnte nicht gespeichert werden.");
    }
  }

  async function deleteEntry(id) {
    if (!isManager) return;
    if (!window.confirm("Eintrag wirklich löschen?")) return;
    try {
      const { error } = await supabase
        .from("time_entries")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await loadEntries();
    } catch (e) {
      logSbError("deleteEntry error:", e);
      alert("Löschen fehlgeschlagen.");
    }
  }

  const summaryCards = [
    { label: "Start", value: toHM(fromMin) },
    { label: "Ende", value: toHM(toMin) },
    { label: "Pause", value: `${breakMin} min` },
    { label: "Fahrzeit", value: formatTravelLabel(travelMin) },
    { label: "Wetter", value: finalWeather || "—" },
  ];

  return (
    <div className="month-overview">
      <div className="month-overview-hero hbz-card">
        <div className="month-overview-hero__content">
          <div>
            <div className="month-overview-kicker">Zeiterfassung</div>
            <h2 className="month-overview-title">Tageserfassung</h2>
            <div className="month-overview-subtitle">
              Datum: <b>{date}</b>
            </div>
            {buakWeekLabel && (
              <div className="month-overview-subtitle">
                <b>{buakWeekLabel}</b>
              </div>
            )}
          </div>

          <div className="month-overview-actions">
            <button
              className="hbz-btn"
              type="button"
              onClick={() => shiftDate(-1)}
            >
              ← Tag zurück
            </button>
            <button
              className="hbz-btn"
              type="button"
              onClick={() => shiftDate(1)}
            >
              Tag vor →
            </button>
          </div>
        </div>
      </div>

      <div className="hbz-card month-main-card">
        <div className="month-card-title">Zeiten erfassen</div>

        <div className="month-filter-grid">
          <div className="field-inline">
            <label className="hbz-label">Datum</label>
            <input
              type="date"
              className="hbz-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="field-inline">
            <label className="hbz-label">Projekt</label>
            <select
              className="hbz-select"
              value={projectId ?? ""}
              disabled={absenceType === "krank" || absenceType === "urlaub"}
              onChange={(e) => setProjectId(e.target.value || null)}
            >
              <option value="">— ohne Projekt —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {assignmentSuggestions.length > 0 && absenceType !== "krank" && absenceType !== "urlaub" && (
          <div className="assignment-prefill-box">
            <div className="assignment-prefill-head">
              <strong>Arbeitseinteilung</strong>
              {assignmentInfo ? <span className="badge-soft">{assignmentInfo}</span> : null}
            </div>

            <div className="assignment-chip-list">
              {assignmentSuggestions.map((item) => {
                const active = String(projectId || "") === String(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`assignment-chip${active ? " active" : ""}`}
                    onClick={() => setProjectId(item.id)}
                  >
                    {item.code ? `${item.code} · ${item.name}` : item.name}
                  </button>
                );
              })}
            </div>

            <div className="help" style={{ marginTop: 8 }}>
              Das erste eingeteilte Projekt wird automatisch vorgeschlagen, du kannst es aber jederzeit ändern.
            </div>
          </div>
        )}

        {projectAddress && absenceType !== "krank" && absenceType !== "urlaub" && (
          <div
            className="help"
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span>
              Baustelle: <b>{projectAddress}</b>
            </span>

            <button
              type="button"
              className="hbz-btn btn-small"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    projectAddress
                  )}`,
                  "_blank"
                )
              }
            >
              Route öffnen
            </button>

            <button
              type="button"
              className="hbz-btn btn-small"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(projectAddress);
                  alert("Adresse kopiert.");
                } catch {
                  alert("Adresse konnte nicht kopiert werden.");
                }
              }}
            >
              Adresse kopieren
            </button>
          </div>
        )}

        {(absenceType === "krank" || absenceType === "urlaub") && (
          <div className="help" style={{ marginTop: 8 }}>
            Bei Krank/Urlaub ist kein Projekt nötig.
          </div>
        )}

        {projectLoadNote && (
          <div className="year-error-box" style={{ marginTop: 12 }}>
            {projectLoadNote}
          </div>
        )}

        {isManager && (
          <div className="month-employee-block">
            <div className="month-employee-head">
              <label className="hbz-label">Mitarbeiter</label>
              <span className="badge-soft">
                {selectedCodes.length} / {employees.length} gewählt
              </span>
            </div>

            <EmployeePicker
              employees={employees}
              selected={selectedCodes}
              onChange={setSelectedCodes}
              enableMulti={true}
            />
          </div>
        )}

        <div className="month-summary-grid" style={{ marginTop: 16 }}>
          {summaryCards.map((card) => (
            <div key={card.label} className="month-summary-card">
              <div className="month-summary-label">{card.label}</div>
              <div className="month-summary-value">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="year-sections" style={{ marginTop: 18 }}>
          <div className="year-section">
            <div className="month-card-title">Arbeitszeit</div>

            <div className="month-card-edit-grid" style={{ marginTop: 10 }}>
              <div className="month-card-field">
                <label className="hbz-label">Start</label>
                <input
                  type="range"
                  min={5 * 60}
                  max={19 * 60 + 30}
                  step={15}
                  value={fromMin}
                  onChange={(e) => {
                    if (absenceType) setAbsenceType(null);
                    setFromMin(Number(e.target.value));
                  }}
                  style={{ width: "100%" }}
                />
                <div className="month-card-mainhrs" style={{ marginTop: 8 }}>
                  {toHM(fromMin)}
                </div>
              </div>

              <div className="month-card-field">
                <label className="hbz-label">Ende</label>
                <input
                  type="range"
                  min={5 * 60}
                  max={19 * 60 + 30}
                  step={15}
                  value={toMin}
                  onChange={(e) => {
                    if (absenceType) setAbsenceType(null);
                    setToMin(Number(e.target.value));
                  }}
                  style={{ width: "100%" }}
                />
                <div className="month-card-mainhrs" style={{ marginTop: 8 }}>
                  {toHM(toMin)}
                </div>
              </div>
            </div>
          </div>

          <div className="year-section">
            <div className="month-card-title">Pause</div>
            <div className="hbz-chipbar">
              {PAUSE_OPTIONS.map((m) => {
                const active = breakMin === m;
                const label = formatTravelLabel(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`hbz-chip ${active ? "active" : ""}`}
                    onClick={() => {
                      if (absenceType) setAbsenceType(null);
                      setBreakMin(m);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="year-section">
            <div className="month-card-title">Abwesenheit</div>
            <div className="hbz-chipbar">
              <button
                type="button"
                className={`hbz-chip ${
                  absenceType === "krank" ? "active" : ""
                }`}
                onClick={() => {
                  setAbsenceType("krank");
                  setProjectId(null);
                  const d = new Date(`${date}T00:00:00`);
                  const isFri = d.getDay() === 5;
                  setFromMin(7 * 60);
                  setToMin(isFri ? 10 * 60 : 16 * 60);
                  setBreakMin(0);
                  setTravelMin(0);
                }}
              >
                Krank
              </button>

              <button
                type="button"
                className={`hbz-chip ${
                  absenceType === "urlaub" ? "active" : ""
                }`}
                onClick={() => {
                  setAbsenceType("urlaub");
                  setProjectId(null);
                  setFromMin(7 * 60);
                  setToMin(7 * 60 + 15);
                  setBreakMin(15);
                  setTravelMin(0);
                }}
              >
                Urlaub
              </button>

              {absenceType && (
                <button
                  type="button"
                  className="hbz-chip"
                  onClick={() => setAbsenceType(null)}
                  title="Abwesenheit zurücksetzen"
                >
                  Normal
                </button>
              )}
            </div>
          </div>

          <div className="year-section">
            <div className="month-card-title">Fahrzeit</div>
            <div className="hbz-chipbar">
              {TRAVEL_OPTIONS.map((m) => {
                const active = travelMin === m;
                const label = formatTravelLabel(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`hbz-chip ${active ? "active" : ""}`}
                    onClick={() => {
                      if (absenceType) setAbsenceType(null);
                      setTravelMin(m);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="help" style={{ marginTop: 8 }}>
              Kostenstelle: <b>FAHRZEIT</b> – wird zur Arbeitszeit dazugerechnet
              und in den Auswertungen separat ausgewiesen.
            </div>
          </div>

          <div className="year-section">
            <div className="month-card-title">Wetter</div>
            <div className="month-card-field">
              <label className="hbz-label">Automatisch von Baustelle + Buchung</label>
              <div className="hbz-input" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{weatherLoading ? "Lade Wetter…" : weatherAuto || "—"}</span>
                <button
                  type="button"
                  className="hbz-btn btn-small"
                  onClick={() => loadWeatherForCurrentBooking(true)}
                  disabled={weatherLoading || !projectAddress || !!absenceType}
                >
                  Aktualisieren
                </button>
              </div>
            </div>

            <div className="month-card-edit-grid" style={{ marginTop: 10 }}>
              <div className="month-card-field">
                <label className="hbz-label">Manuell ändern</label>
                <select
                  className="hbz-input"
                  value={weatherManual || "Automatisch"}
                  disabled={!!absenceType}
                  onChange={(e) => {
                    const value = e.target.value;
                    setWeatherManual(value === "Automatisch" ? "" : value);
                  }}
                >
                  {WEATHER_MANUAL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="month-card-field">
                <label className="hbz-label">Finales Wetter</label>
                <div className="hbz-input">{finalWeather || "—"}</div>
              </div>
            </div>

            <div className="month-card-meta" style={{ marginTop: 10 }}>
              <span>Temperatur: {formatTemp(temperature)}</span>
              <span>Niederschlag: {formatPrecip(precipitation)}</span>
              <span>Quelle: {weatherSource || "—"}</span>
            </div>

            {weatherError && <div className="help" style={{ marginTop: 8 }}>{weatherError}</div>}
          </div>
        </div>

        <div className="year-range-active" style={{ marginTop: 16 }}>
          <strong>Arbeitszeit heute:</strong> {totalHours.toFixed(2)} h
          {totalOvertime > 0
            ? ` | Ü: ${totalOvertime.toFixed(2)} h`
            : " | keine Überstunden"}
        </div>

        <div className="month-card-field" style={{ marginTop: 16 }}>
          <label className="hbz-label">Notiz</label>
          <textarea
            className="hbz-textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Tätigkeit, Besonderheiten…"
          />
        </div>

        {error && (
          <div className="year-error-box" style={{ marginTop: 12 }}>
            <b>Hinweis:</b> {error}
          </div>
        )}

        <div className="save-bar">
          <button
            type="button"
            className="save-btn lg"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </div>

      <div className="hbz-card month-main-card">
        <div className="month-main-header">
          <div>
            <div className="month-card-title">Einträge am {date}</div>
            <div className="month-main-subtitle">
              {loading ? "Lade Einträge…" : "Tagesübersicht"}
            </div>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="month-empty-state">Keine Einträge.</div>
        ) : (
          <>
            {!isMobile && (
              <div className="month-table-wrap">
                <table className="month-table">
                  <thead>
                    <tr>
                      <th>Mitarbeiter</th>
                      <th>Projekt</th>
                      <th className="num">Start</th>
                      <th className="num">Ende</th>
                      <th className="num">Pause</th>
                      <th className="num">Fahrzeit</th>
                      <th className="num">Stunden</th>
                      <th className="num">Überstunden</th>
                      <th>Wetter</th>
                      <th>Notiz</th>
                      <th className="num">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((r) => {
                      const start = r.start_min ?? r.from_min ?? 0;
                      const end = r.end_min ?? r.to_min ?? 0;
                      const breakM = r.break_min ?? 0;
                      const travelM =
                        r.travel_minutes ?? r.travel_min ?? r.travel ?? 0;
                      const work = Math.max(end - start - breakM, 0);
                      const total = work + (travelM || 0);
                      const hrs = h2(total);
                      const ot = Math.max(hrs - 9, 0);
                      const isEditing = editId === r.id;

                      if (!isEditing) {
                        return (
                          <tr key={r.id}>
                            <td>{r.employee_name || r.employee_id}</td>
                            <td>{r.project_name || "—"}</td>
                            <td className="num">{toHM(start)}</td>
                            <td className="num">{toHM(end)}</td>
                            <td className="num">{breakM} min</td>
                            <td className="num">{travelM} min</td>
                            <td className="num">{hrs.toFixed(2)}</td>
                            <td className="num">{ot.toFixed(2)}</td>
                            <td>{getWeatherFinalLabel(r) || "—"}</td>
                            <td>{r.note || ""}</td>
                            <td className="num">
                              {isManager ? (
                                <div className="month-action-group">
                                  <button
                                    className="hbz-btn btn-small"
                                    type="button"
                                    onClick={() => startEdit(r)}
                                  >
                                    Bearbeiten
                                  </button>
                                  <button
                                    className="hbz-btn btn-small"
                                    type="button"
                                    onClick={() => deleteEntry(r.id)}
                                  >
                                    Löschen
                                  </button>
                                </div>
                              ) : (
                                <span className="help">nur Anzeige</span>
                              )}
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={`${r.id}-edit`}>
                          <td>{r.employee_name || r.employee_id}</td>
                          <td>
                            <select
                              className="hbz-input"
                              value={editState.project_id ?? ""}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  project_id: e.target.value || null,
                                }))
                              }
                            >
                              <option value="">— ohne Projekt —</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.code ? `${p.code} · ${p.name}` : p.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="num">
                            <input
                              type="time"
                              className="hbz-input"
                              value={editState.from_hm}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  from_hm: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="num">
                            <input
                              type="time"
                              className="hbz-input"
                              value={editState.to_hm}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  to_hm: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min={0}
                              step={5}
                              className="hbz-input"
                              value={editState.break_min}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  break_min: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min={0}
                              step={5}
                              className="hbz-input"
                              value={editState.travel_minutes ?? 0}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  travel_minutes: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="num">
                            {(() => {
                              const startM = hmToMin(editState.from_hm);
                              const endM = hmToMin(editState.to_hm);
                              const br =
                                parseInt(editState.break_min || "0", 10) || 0;
                              const tr =
                                parseInt(editState.travel_minutes || "0", 10) ||
                                0;
                              const w = Math.max(endM - startM - br, 0) + tr;
                              const h = h2(w);
                              return h.toFixed(2);
                            })()}
                          </td>
                          <td className="num">
                            {(() => {
                              const startM = hmToMin(editState.from_hm);
                              const endM = hmToMin(editState.to_hm);
                              const br =
                                parseInt(editState.break_min || "0", 10) || 0;
                              const tr =
                                parseInt(editState.travel_minutes || "0", 10) ||
                                0;
                              const w = Math.max(endM - startM - br, 0) + tr;
                              const h = h2(w);
                              const o = Math.max(h - 9, 0);
                              return o.toFixed(2);
                            })()}
                          </td>
                          <td>
                            <select
                              className="hbz-input"
                              value={editState.weather_manual || "Automatisch"}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  weather_manual:
                                    e.target.value === "Automatisch" ? "" : e.target.value,
                                }))
                              }
                            >
                              {WEATHER_MANUAL_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              className="hbz-input"
                              value={editState.note}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  note: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td className="num">
                            <div className="month-action-group">
                              <button
                                className="hbz-btn btn-small"
                                type="button"
                                onClick={saveEdit}
                              >
                                Speichern
                              </button>
                              <button
                                className="hbz-btn btn-small"
                                type="button"
                                onClick={cancelEdit}
                              >
                                Abbrechen
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {isMobile && (
              <div className="month-cards">
                {entries.map((r) => {
                  const start = r.start_min ?? r.from_min ?? 0;
                  const end = r.end_min ?? r.to_min ?? 0;
                  const breakM = r.break_min ?? 0;
                  const travelM =
                    r.travel_minutes ?? r.travel_min ?? r.travel ?? 0;
                  const work = Math.max(end - start - breakM, 0);
                  const total = work + (travelM || 0);
                  const hrs = h2(total);
                  const ot = Math.max(hrs - 9, 0);
                  const isEditing = editId === r.id;

                  if (!isEditing) {
                    return (
                      <div key={`card-${r.id}`} className="month-card">
                        <div className="month-card-header">
                          <div>
                            <div className="month-card-date">{date}</div>
                            <div className="month-card-emp">
                              {r.employee_name || r.employee_id}
                            </div>
                          </div>
                          <div className="month-card-hours">
                            <div className="month-card-mainhrs">
                              {hrs.toFixed(2)} h
                            </div>
                            <div className="month-card-ot">
                              Ü: {ot.toFixed(2)} h
                            </div>
                          </div>
                        </div>

                        <div className="month-card-row">
                          <strong>Projekt:</strong> {r.project_name || "—"}
                        </div>

                        <div className="month-card-meta">
                          <span>Start: {toHM(start)}</span>
                          <span>Ende: {toHM(end)}</span>
                          <span>Pause: {breakM} min</span>
                          <span>Fahrzeit: {travelM} min</span>
                        </div>

                        <div className="month-card-row">
                          <strong>Wetter:</strong> {getWeatherFinalLabel(r) || "—"}
                        </div>

                        {r.note && (
                          <div className="month-card-row">
                            <strong>Notiz:</strong> {r.note}
                          </div>
                        )}

                        <div className="month-card-actions">
                          {isManager ? (
                            <>
                              <button
                                className="hbz-btn btn-small"
                                type="button"
                                onClick={() => startEdit(r)}
                              >
                                Bearbeiten
                              </button>
                              <button
                                className="hbz-btn btn-small"
                                type="button"
                                onClick={() => deleteEntry(r.id)}
                              >
                                Löschen
                              </button>
                            </>
                          ) : (
                            <span className="help">nur Anzeige</span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const minsLive =
                    Math.max(
                      hmToMin(editState.to_hm) -
                        hmToMin(editState.from_hm) -
                        (parseInt(editState.break_min || "0", 10) || 0),
                      0
                    ) +
                    (parseInt(editState.travel_minutes || "0", 10) || 0);
                  const hrsLive = h2(minsLive);
                  const otLive = Math.max(hrsLive - 9, 0);

                  return (
                    <div key={`card-${r.id}-edit`} className="month-card month-card-edit">
                      <div className="month-card-header">
                        <div>
                          <div className="month-card-date">{date}</div>
                          <div className="month-card-emp">
                            {r.employee_name || r.employee_id}
                          </div>
                        </div>
                        <div className="month-card-hours">
                          <div className="month-card-mainhrs">
                            {hrsLive.toFixed(2)} h
                          </div>
                          <div className="month-card-ot">
                            Ü: {otLive.toFixed(2)} h
                          </div>
                        </div>
                      </div>

                      <div className="month-card-field">
                        <label className="hbz-label">Projekt</label>
                        <select
                          className="hbz-input"
                          value={editState.project_id ?? ""}
                          onChange={(e) =>
                            setEditState((s) => ({
                              ...s,
                              project_id: e.target.value || null,
                            }))
                          }
                        >
                          <option value="">— ohne Projekt —</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code ? `${p.code} · ${p.name}` : p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="month-card-edit-grid">
                        <div className="month-card-field">
                          <label className="hbz-label">Start</label>
                          <input
                            type="time"
                            className="hbz-input"
                            value={editState.from_hm}
                            onChange={(e) =>
                              setEditState((s) => ({
                                ...s,
                                from_hm: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="month-card-field">
                          <label className="hbz-label">Ende</label>
                          <input
                            type="time"
                            className="hbz-input"
                            value={editState.to_hm}
                            onChange={(e) =>
                              setEditState((s) => ({
                                ...s,
                                to_hm: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="month-card-edit-grid">
                        <div className="month-card-field">
                          <label className="hbz-label">Pause (min)</label>
                          <input
                            type="number"
                            min={0}
                            step={5}
                            className="hbz-input"
                            value={editState.break_min}
                            onChange={(e) =>
                              setEditState((s) => ({
                                ...s,
                                break_min: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="month-card-field">
                          <label className="hbz-label">Fahrzeit (min)</label>
                          <input
                            type="number"
                            min={0}
                            step={5}
                            className="hbz-input"
                            value={editState.travel_minutes ?? 0}
                            onChange={(e) =>
                              setEditState((s) => ({
                                ...s,
                                travel_minutes: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="month-card-field">
                        <label className="hbz-label">Wetter</label>
                        <select
                          className="hbz-input"
                          value={editState.weather_manual || "Automatisch"}
                          onChange={(e) =>
                            setEditState((s) => ({
                              ...s,
                              weather_manual:
                                e.target.value === "Automatisch" ? "" : e.target.value,
                            }))
                          }
                        >
                          {WEATHER_MANUAL_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="month-card-field">
                        <label className="hbz-label">Notiz</label>
                        <input
                          type="text"
                          className="hbz-input"
                          value={editState.note}
                          onChange={(e) =>
                            setEditState((s) => ({
                              ...s,
                              note: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="month-card-footer">
                        <span className="month-card-summary">
                          {hrsLive.toFixed(2)} h / Ü: {otLive.toFixed(2)} h
                        </span>
                        <div className="month-card-actions">
                          <button
                            className="hbz-btn btn-small"
                            type="button"
                            onClick={saveEdit}
                          >
                            Speichern
                          </button>
                          <button
                            className="hbz-btn btn-small"
                            type="button"
                            onClick={cancelEdit}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}