import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { getEmployeeWorkDay, getBuakWeekType, getHolidayName, hmToMinutes } from "../utils/time";

const todayISO = () => new Date().toISOString().slice(0, 10);

function parseDateLocal(iso) {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatISODate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dt, days) {
  const next = new Date(dt);
  next.setDate(next.getDate() + days);
  return next;
}

function dateRange(from, to) {
  const start = parseDateLocal(from);
  const end = parseDateLocal(to);
  if (!start || !end || end < start) return [];
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(formatISODate(d));
  return out;
}

function startOfWeek(dateStr) {
  const d = parseDateLocal(dateStr) || new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

function getWeekNumber(dateStr) {
  const d = parseDateLocal(dateStr) || new Date();
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4, 12, 0, 0, 0);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
}

function isFriday(dateStr) {
  const d = parseDateLocal(dateStr);
  return d?.getDay() === 5;
}

function monthStart(dateStr) {
  const d = parseDateLocal(dateStr) || new Date();
  return formatISODate(new Date(d.getFullYear(), d.getMonth(), 1, 12));
}

function monthEnd(dateStr) {
  const d = parseDateLocal(dateStr) || new Date();
  return formatISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

function formatDateAT(dateStr) {
  const d = parseDateLocal(dateStr);
  if (!d) return dateStr || "—";
  return d.toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

function toHM(min) {
  const m = Number(min || 0);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function isVacationEntry(row) {
  const note = String(row?.note || "").toLowerCase();
  const absence = String(row?.absence_type || row?.absenceType || "").toLowerCase();
  return absence === "urlaub" || note.includes("[urlaub]") || note.includes("urlaub");
}

function getEmployeeLabel(emp) {
  return [emp?.name, emp?.code ? `(${emp.code})` : ""].filter(Boolean).join(" ");
}

function sameEmployee(emp, session) {
  if (!emp || !session) return false;
  if (session?.id && String(emp.id) === String(session.id)) return true;
  if (session?.code && String(emp.code || "") === String(session.code)) return true;
  return false;
}

function stripVacationNote(note) {
  return String(note || "").replace(/^\s*\[Urlaub\]\s*/i, "").trim();
}

export default function VacationEntry() {
  const session = getSession()?.user || {};

  const [employees, setEmployees] = useState([]);
  const [ownEmployee, setOwnEmployee] = useState(null);
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [onlyWorkdays, setOnlyWorkdays] = useState(true);
  const [replaceExistingVacation, setReplaceExistingVacation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewRows, setPreviewRows] = useState([]);
  const [vacationRows, setVacationRows] = useState([]);

  const calendarFrom = useMemo(() => monthStart(fromDate), [fromDate]);
  const calendarTo = useMemo(() => monthEnd(toDate || fromDate), [fromDate, toDate]);

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .order("name", { ascending: true });
        if (error) throw error;

        const rows = (data || []).filter((e) => e?.active !== false && e?.disabled !== true);
        const own = rows.find((e) => sameEmployee(e, session)) || null;

        if (!cancelled) {
          setEmployees(rows);
          setOwnEmployee(own);
          if (!own) setError("Dein Mitarbeiter-Datensatz wurde nicht gefunden. Urlaub kann nicht eingetragen werden.");
        }
      } catch (e) {
        console.error("[VacationEntry] employees load error", e);
        if (!cancelled) setError("Mitarbeiter konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadEmployees();
    return () => {
      cancelled = true;
    };
  }, [session?.code, session?.id]);

  const employeeById = useMemo(() => {
    const map = new Map();
    employees.forEach((e) => map.set(String(e.id), e));
    return map;
  }, [employees]);

  async function loadVacations() {
    setCalendarLoading(true);
    try {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, employee_id, work_date, note")
        .gte("work_date", calendarFrom)
        .lte("work_date", calendarTo)
        .order("work_date", { ascending: true });
      if (error) throw error;
      setVacationRows((data || []).filter(isVacationEntry));
    } catch (e) {
      console.error("[VacationEntry] vacation load error", e);
      setError(e?.message || "Urlaubskalender konnte nicht geladen werden.");
    } finally {
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    if (employees.length === 0) return;
    loadVacations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarFrom, calendarTo, employees.length]);

  const preview = useMemo(() => {
    if (!ownEmployee) return [];
    const days = dateRange(fromDate, toDate);
    const rows = [];
    for (const day of days) {
      const workDay = getEmployeeWorkDay(ownEmployee, day);
      const requiredMinutes = Number(workDay?.requiredMinutes || 0);
      const isActiveDay = !!workDay?.active && requiredMinutes > 0;
      if (onlyWorkdays && !isActiveDay) continue;
      rows.push({
        employee: ownEmployee,
        date: day,
        requiredMinutes,
        startMin: workDay?.active ? hmToMinutes(workDay.start) : 7 * 60,
        weekType: getBuakWeekType(day),
        holidayName: getHolidayName(day),
      });
    }
    return rows;
  }, [fromDate, toDate, onlyWorkdays, ownEmployee]);

  useEffect(() => {
    setPreviewRows(preview.slice(0, 120));
  }, [preview]);

  const buakCalendarWeeks = useMemo(() => {
    const start = startOfWeek(calendarFrom);
    const end = parseDateLocal(calendarTo) || start;
    const rows = [];
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 7)) {
      const monday = formatISODate(cursor);
      const weekType = getBuakWeekType(monday);
      const days = Array.from({ length: 5 }, (_, idx) => {
        const d = addDays(cursor, idx);
        const iso = formatISODate(d);
        return {
          iso,
          label: d.toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", ""),
          holidayName: getHolidayName(iso),
          shortFriday: weekType === "kurz" && isFriday(iso),
        };
      });
      rows.push({ monday, kw: getWeekNumber(monday), weekType, days });
    }
    return rows;
  }, [calendarFrom, calendarTo]);

  const vacationDisplayRows = useMemo(() => {
    return vacationRows
      .map((row) => ({
        ...row,
        employee: employeeById.get(String(row.employee_id)) || null,
      }))
      .filter((row) => row.employee)
      .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)) || String(a.employee?.name || "").localeCompare(String(b.employee?.name || ""), "de"));
  }, [vacationRows, employeeById]);

  async function saveVacation() {
    setError("");
    setMessage("");

    if (!ownEmployee) {
      setError("Dein Mitarbeiter-Datensatz wurde nicht gefunden. Urlaub kann nicht eingetragen werden.");
      return;
    }
    if (!fromDate || !toDate) {
      setError("Bitte Von- und Bis-Datum auswählen.");
      return;
    }
    if (parseDateLocal(toDate) < parseDateLocal(fromDate)) {
      setError("Bis-Datum darf nicht vor dem Von-Datum liegen.");
      return;
    }
    if (preview.length === 0) {
      setError("Für diesen Zeitraum gibt es laut Arbeitszeitmodell keine Urlaubstage zum Eintragen.");
      return;
    }

    try {
      setSaving(true);

      const { data: existing, error: existingError } = await supabase
        .from("time_entries")
        .select("id, employee_id, work_date, note")
        .eq("employee_id", ownEmployee.id)
        .gte("work_date", fromDate)
        .lte("work_date", toDate);
      if (existingError) throw existingError;

      const existingMap = new Map();
      for (const row of existing || []) {
        const key = String(row.work_date).slice(0, 10);
        if (!existingMap.has(key)) existingMap.set(key, []);
        existingMap.get(key).push(row);
      }

      const deleteIds = [];
      const rowsToInsert = [];
      const skipped = [];

      for (const item of preview) {
        const existingRows = existingMap.get(item.date) || [];

        if (existingRows.length > 0) {
          const onlyVacationRows = existingRows.every(isVacationEntry);
          if (replaceExistingVacation && onlyVacationRows) {
            deleteIds.push(...existingRows.map((r) => r.id));
          } else {
            skipped.push(item.date);
            continue;
          }
        }

        const start = Number(item.startMin || 7 * 60);
        rowsToInsert.push({
          employee_id: ownEmployee.id,
          work_date: item.date,
          project_id: null,
          project: null,
          start_min: start,
          end_min: start + 15,
          break_min: 15,
          travel_minutes: 0,
          travel_cost_center: "FAHRZEIT",
          crane_hours: 0,
          private_pkw_km: 0,
          za_hours: 0,
          bad_weather: false,
          bad_weather_minutes: 0,
          weather_auto: null,
          weather_manual: null,
          weather_final: null,
          note: `[Urlaub]${note.trim() ? ` ${note.trim()}` : ""}`,
        });
      }

      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase.from("time_entries").delete().in("id", deleteIds);
        if (deleteError) throw deleteError;
      }

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase.from("time_entries").insert(rowsToInsert);
        if (insertError) throw insertError;
      }

      setMessage(
        `Urlaub eingetragen: ${rowsToInsert.length} Tag${rowsToInsert.length === 1 ? "" : "e"}.` +
          (skipped.length > 0
            ? ` Nicht gespeichert: ${skipped.length} Tag${skipped.length === 1 ? "" : "e"}, weil dort bereits ein eigener Eintrag vorhanden ist.`
            : "")
      );
      await loadVacations();
    } catch (e) {
      console.error("[VacationEntry] save error", e);
      setError(e?.message || "Urlaub konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOwnVacation(row) {
    const emp = employeeById.get(String(row.employee_id));
    if (!sameEmployee(emp, session)) return;
    const ok = window.confirm("Eigenen Urlaubseintrag wirklich löschen?");
    if (!ok) return;
    setError("");
    setMessage("");
    try {
      const { error } = await supabase.from("time_entries").delete().eq("id", row.id);
      if (error) throw error;
      setMessage("Urlaubseintrag gelöscht.");
      await loadVacations();
    } catch (e) {
      console.error("[VacationEntry] delete error", e);
      setError(e?.message || "Urlaubseintrag konnte nicht gelöscht werden.");
    }
  }

  return (
    <div className="page-wrap">
      <section className="hero-card">
        <div className="eyebrow">Urlaub</div>
        <h1>Urlaub eintragen</h1>
        <p>Jeder Mitarbeiter sieht den Urlaubskalender und kann nur den eigenen Urlaub eintragen oder ändern.</p>
      </section>

      <section className="month-card" style={{ marginTop: 18 }}>
        <div className="month-card-title">Urlaubszeitraum</div>

        {error && <div className="hbz-alert hbz-alert-error">{error}</div>}
        {message && <div className="hbz-alert hbz-alert-ok">{message}</div>}

        <div className="hbz-grid-2" style={{ marginTop: 12 }}>
          <label className="hbz-field">
            <span className="hbz-label">Von</span>
            <input className="hbz-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="hbz-field">
            <span className="hbz-label">Bis</span>
            <input className="hbz-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>

        <div className="hbz-info-line" style={{ marginTop: 10 }}>
          Urlaub wird eingetragen für: <b>{ownEmployee ? getEmployeeLabel(ownEmployee) : "nicht gefunden"}</b>
        </div>

        <label className="hbz-field" style={{ marginTop: 12 }}>
          <span className="hbz-label">Notiz optional</span>
          <input className="hbz-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Sommerurlaub" />
        </label>

        <div className="hbz-chipbar" style={{ marginTop: 12 }}>
          <button type="button" className={`hbz-chip ${onlyWorkdays ? "active" : ""}`} onClick={() => setOnlyWorkdays((v) => !v)}>
            Nur Arbeitstage laut Modell
          </button>
          <button type="button" className={`hbz-chip ${replaceExistingVacation ? "active" : ""}`} onClick={() => setReplaceExistingVacation((v) => !v)}>
            eigenen vorhandenen Urlaub überschreiben
          </button>
        </div>
      </section>

      <section className="month-card" style={{ marginTop: 18 }}>
        <div className="month-card-title">BUAK Kalender</div>
        <p className="hint">Kurze und lange Wochen laut BUAK-Modell. Kurze Freitage sind frei/0 h, Feiertage werden markiert.</p>
        <div className="vac-week-grid">
          {buakCalendarWeeks.map((week) => (
            <div key={week.monday} className={`vac-week-card ${week.weekType === "kurz" ? "short" : "long"}`}>
              <div className="vac-week-head">
                <b>KW {week.kw}</b>
                <span>{week.weekType === "kurz" ? "Kurzwoche" : "Langwoche"}</span>
              </div>
              <div className="vac-day-row">
                {week.days.map((day) => (
                  <div key={day.iso} className={`vac-day ${day.holidayName ? "holiday" : ""} ${day.shortFriday ? "shortFriday" : ""}`} title={day.holidayName || day.iso}>
                    <div>{day.label}</div>
                    {day.holidayName ? <small>Feiertag</small> : day.shortFriday ? <small>frei</small> : <small>{week.weekType === "kurz" ? "kurz" : "lang"}</small>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="month-card" style={{ marginTop: 18 }}>
        <div className="month-card-title">Vorschau eigener Urlaub</div>
        <p className="hint">Es werden {preview.length} Urlaubstag{preview.length === 1 ? "" : "e"} vorbereitet. Bestehende eigene Einträge werden nicht überschrieben, außer es ist ausdrücklich aktiviert.</p>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table className="hbz-table compact">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Datum</th>
                <th>Woche</th>
                <th>Soll laut Modell</th>
                <th>Hinweis</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>Lade Mitarbeiter…</td></tr>
              ) : previewRows.length === 0 ? (
                <tr><td colSpan={5}>Keine Urlaubstage in der Vorschau.</td></tr>
              ) : (
                previewRows.map((row, idx) => (
                  <tr key={`${row.employee.id}-${row.date}-${idx}`}>
                    <td>{row.employee.name}</td>
                    <td>{formatDateAT(row.date)}</td>
                    <td><span className={`vac-pill ${row.weekType === "kurz" ? "short" : "long"}`}>{row.weekType === "kurz" ? "Kurzwoche" : "Langwoche"}</span></td>
                    <td>{(row.requiredMinutes / 60).toFixed(2).replace(".", ",")} h</td>
                    <td>{row.holidayName ? `Feiertag: ${row.holidayName}` : `[Urlaub] ${toHM(row.startMin)} / 0,00 h`}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {preview.length > previewRows.length && <p className="hint">Vorschau gekürzt. Gespeichert werden trotzdem alle vorbereiteten Tage.</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="save-btn lg" onClick={saveVacation} disabled={saving || preview.length === 0 || !ownEmployee}>
            {saving ? "Speichere…" : "Meinen Urlaub eintragen"}
          </button>
        </div>
      </section>

      <section className="month-card" style={{ marginTop: 18 }}>
        <div className="month-card-title">Urlaubskalender alle Mitarbeiter</div>
        <p className="hint">Alle dürfen sehen, wann Urlaub eingetragen ist. Löschen/Ändern ist nur beim eigenen Urlaub möglich.</p>
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table className="hbz-table compact">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Mitarbeiter</th>
                <th>Woche</th>
                <th>Notiz</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {calendarLoading ? (
                <tr><td colSpan={5}>Lade Urlaubskalender…</td></tr>
              ) : vacationDisplayRows.length === 0 ? (
                <tr><td colSpan={5}>In diesem Zeitraum ist kein Urlaub eingetragen.</td></tr>
              ) : (
                vacationDisplayRows.map((row) => {
                  const own = sameEmployee(row.employee, session);
                  const weekType = getBuakWeekType(row.work_date);
                  return (
                    <tr key={row.id} className={own ? "vac-own-row" : ""}>
                      <td>{formatDateAT(row.work_date)}</td>
                      <td>{row.employee?.name || "—"}</td>
                      <td><span className={`vac-pill ${weekType === "kurz" ? "short" : "long"}`}>{weekType === "kurz" ? "Kurzwoche" : "Langwoche"}</span></td>
                      <td>{stripVacationNote(row.note) || "—"}</td>
                      <td>
                        {own ? (
                          <button type="button" className="hbz-mini-danger" onClick={() => deleteOwnVacation(row)}>Eigenen Eintrag löschen</button>
                        ) : (
                          <span className="hint">nur Anzeige</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style>{`
        .hbz-alert { border-radius: 12px; padding: 10px 12px; margin: 10px 0; font-weight: 700; }
        .hbz-alert-error { border: 1px solid #ff8b8b; background: #fff5f5; color: #8a1f1f; }
        .hbz-alert-ok { border: 1px solid #9bd3a6; background: #f2fff5; color: #1d6a30; }
        .hint { color: #7d6756; font-size: 12px; }
        .hbz-info-line { border: 1px solid rgba(92, 68, 45, 0.16); background: rgba(255,255,255,0.62); border-radius: 12px; padding: 10px 12px; color: #4c3727; }
        .table-scroll { overflow-x: auto; }
        .hbz-table.compact th, .hbz-table.compact td { padding: 8px 10px; white-space: nowrap; }
        .vac-week-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin-top: 12px; }
        .vac-week-card { border: 1px solid rgba(92, 68, 45, 0.14); border-radius: 14px; padding: 10px; background: rgba(255,255,255,0.70); }
        .vac-week-card.short { background: #f2fff5; }
        .vac-week-card.long { background: #fff5f0; }
        .vac-week-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; color: #3d2a1b; }
        .vac-week-head span { font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: .02em; }
        .vac-day-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
        .vac-day { min-height: 54px; border-radius: 10px; padding: 7px 5px; text-align: center; background: rgba(255,255,255,0.78); border: 1px solid rgba(92, 68, 45, 0.12); font-weight: 800; }
        .vac-day small { display: block; margin-top: 3px; font-weight: 700; color: #7d6756; font-size: 10px; }
        .vac-day.holiday { background: #ffecec; border-color: #e29b9b; }
        .vac-day.shortFriday { background: #eaf7ef; border-color: #9bd3a6; }
        .vac-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 900; }
        .vac-pill.short { background: #e7f7ed; color: #1d6a30; }
        .vac-pill.long { background: #fff0e3; color: #85460a; }
        .vac-own-row { background: rgba(222, 242, 232, 0.62); }
        .hbz-mini-danger { border: 1px solid #d88; background: #fff4f4; color: #8a1f1f; border-radius: 999px; padding: 6px 10px; font-weight: 800; cursor: pointer; }
        .hbz-mini-danger:hover { background: #ffe8e8; }
      `}</style>
    </div>
  );
}
