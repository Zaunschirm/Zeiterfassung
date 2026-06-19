import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { DEFAULT_OFFICE_WORK_TIME_SETTINGS, normalizeWorkTimeSettings } from "../utils/time";
import { calculateZaBalanceForEmployee } from "../utils/overtime";

const PERMISSION_OPTIONS = [
  { key: "writeOwnTime", label: "Eigene Stunden schreiben" },
  { key: "writeAllTime", label: "Für alle MA Stunden schreiben" },
  { key: "editOwnTime", label: "Eigene Stunden bearbeiten" },
  { key: "editAllTime", label: "Alle Stunden bearbeiten" },
  { key: "deleteOwnTime", label: "Eigene Stunden löschen" },
  { key: "deleteAllTime", label: "Alle Stunden löschen" },
  { key: "viewMonthlyOverview", label: "Monatsübersicht sehen" },
  { key: "viewYearOverview", label: "Jahresübersicht sehen" },
  { key: "viewAssignments", label: "Arbeitseinteilung sehen" },
  { key: "manageAssignments", label: "Arbeitseinteilung bearbeiten" },
  { key: "manageProjects", label: "Projekte bearbeiten" },
  { key: "manageEmployees", label: "Mitarbeiter verwalten" },
];

const EMPTY_PERMISSIONS = Object.fromEntries(PERMISSION_OPTIONS.map((p) => [p.key, false]));

const ROLE_OPTIONS = [
  { value: "mitarbeiter", label: "Mitarbeiter" },
  { value: "teamleiter", label: "Teamleiter" },
  { value: "admin", label: "Admin" },
  { value: "buchhaltung", label: "Verwaltung/Buchhaltung" },
];

const WORK_TIME_MODEL_OPTIONS = [
  { value: "buak", label: "BUAK / Zimmerer" },
  { value: "verwaltung", label: "Verwaltung / Buchhaltung" },
  { value: "individuell", label: "Individuell" },
];

const WEEKDAYS = [
  [1, "Montag"],
  [2, "Dienstag"],
  [3, "Mittwoch"],
  [4, "Donnerstag"],
  [5, "Freitag"],
  [6, "Samstag"],
  [7, "Sonntag"],
];

function roleLabel(role) {
  const key = String(role || "mitarbeiter").trim().toLowerCase();
  return ROLE_OPTIONS.find((r) => r.value === key)?.label || role || "Mitarbeiter";
}

function normalizePermissions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_PERMISSIONS };
  }
  return {
    ...EMPTY_PERMISSIONS,
    ...value,
  };
}

function permissionSummary(permissions) {
  const active = PERMISSION_OPTIONS.filter((p) => !!permissions?.[p.key]).map((p) => p.label);
  if (!active.length) return "Keine Sonderrechte";
  if (active.length <= 2) return active.join(", ");
  return `${active.slice(0, 2).join(", ")} +${active.length - 2}`;
}


function parseHours(value) {
  if (value === null || typeof value === "undefined") return 0;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatHours(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2).replace(".", ",")} h`;
}

function sortByDateDesc(a, b) {
  return String(b.adjustment_date || "").localeCompare(String(a.adjustment_date || ""));
}

function isOnOrAfterStartDate(dateValue, startDate) {
  if (!startDate) return true;
  if (!dateValue) return true;
  return String(dateValue).slice(0, 10) >= String(startDate).slice(0, 10);
}

function dateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function dateToDayNumber(value) {
  const d = dateOnly(value);
  const parts = d.split("-").map((v) => Number(v));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return NaN;
  const [year, month, day] = parts;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function dayNumberToDate(dayNumber) {
  return new Date(dayNumber * 86400000).toISOString().slice(0, 10);
}

function getYesterdayDateString() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 1)).toISOString().slice(0, 10);
}

function lastDayOfMonthDateString(value) {
  const d = dateOnly(value);
  const parts = d.split("-").map((v) => Number(v));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return "";
  const [year, month] = parts;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function isLastDayOfMonth(value) {
  const d = dateOnly(value);
  return !!d && d === lastDayOfMonthDateString(d);
}

function formatDateAT(value) {
  const d = dateOnly(value);
  if (!d) return "—";
  const [year, month, day] = d.split("-");
  return `${day}.${month}.${year}`;
}

function minDate(a, b) {
  if (!a) return b || "";
  if (!b) return a || "";
  return a <= b ? a : b;
}

function isZaAccountEnabled(emp) {
  return emp?.include_in_za_account !== false;
}

const ZA_OFFICIAL_START_NOTE = "Startwert ZA Tagesende 31.05.2026 lt. Mai-Lohnzettel";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isOfficialZaStartAdjustment(adj) {
  const note = normalizeText(adj?.note);
  return note === normalizeText(ZA_OFFICIAL_START_NOTE) || (note.includes("startwert") && note.includes("31.05.2026") && note.includes("lohnzettel"));
}

function isLegacyPreStartZaCorrection(adj) {
  const note = normalizeText(adj?.note);
  return note.includes("startwert")
    || note.includes("korrektur mai")
    || note.includes("31.05")
    || note.includes("01.06")
    || note.includes("lohnzettel");
}

function shouldCountZaAdjustment(adj, emp) {
  const startDate = dateOnly(emp?.za_start_date);
  const adjustmentDate = dateOnly(adj?.adjustment_date);

  if (!startDate) return true;
  if (!adjustmentDate) return false;

  // Alles vor dem Startdatum wird fachlich ignoriert.
  if (adjustmentDate < startDate) return false;

  // Am Startdatum zählt nur der offizielle Lohnverrechnungs-Startstand.
  // Dadurch bleiben alte Test-/Doppelkorrekturen vom 01.06. draußen.
  if (adjustmentDate === startDate) {
    return isOfficialZaStartAdjustment(adj);
  }

  // Alte Mai-/Startwert-Korrekturen, die irrtümlich später gespeichert wurden,
  // dürfen den laufenden Juni-Stand nicht verfälschen.
  if (isLegacyPreStartZaCorrection(adj)) return false;

  // Echte manuelle Korrekturen nach dem Startdatum zählen normal weiter.
  return true;
}

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [entries, setEntries] = useState([]);
  const [overtimeAdjustments, setOvertimeAdjustments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [overtimeLoading, setOvertimeLoading] = useState(false);
  const [err, setErr] = useState("");
  const [overtimeErr, setOvertimeErr] = useState("");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState("mitarbeiter");
  const [permissions, setPermissions] = useState({ ...EMPTY_PERMISSIONS });
  const [showInDailyCheck, setShowInDailyCheck] = useState(true);
  const [workTimeModel, setWorkTimeModel] = useState("buak");
  const [workTimeSettings, setWorkTimeSettings] = useState(() => normalizeWorkTimeSettings(DEFAULT_OFFICE_WORK_TIME_SETTINGS));
  const [zaStartDate, setZaStartDate] = useState("");
  const [includeInZaAccount, setIncludeInZaAccount] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adjustEmployeeId, setAdjustEmployeeId] = useState("");
  const [adjustHours, setAdjustHours] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  const [editId, setEditId] = useState(null);

  const activePermissionCount = useMemo(
    () => Object.values(permissions).filter(Boolean).length,
    [permissions]
  );


  const overtimeByEmployee = useMemo(() => {
    const map = new Map();
    const accountEndDate = getYesterdayDateString();
    for (const emp of rows) {
      const empId = String(emp.id);
      const empEntries = (entries || []).filter((row) => String(row.employee_id || "") === empId);
      const entryDates = empEntries.map((row) => dateOnly(row.work_date)).filter(Boolean).sort();
      const firstEntryDate = entryDates[0] || "";
      const lastEntryDate = entryDates[entryDates.length - 1] || "";
      const included = isZaAccountEnabled(emp);
      const startDate = emp.za_start_date || firstEntryDate;
      const endDate = emp.disabled ? minDate(lastEntryDate || accountEndDate, accountEndDate) : accountEndDate;
      const countedAdjustments = (overtimeAdjustments || []).filter(
        (adj) => String(adj.employee_id || "") === empId && shouldCountZaAdjustment(adj, emp)
      );
      const balance = included && startDate
        ? calculateZaBalanceForEmployee({
            employee: emp,
            entries: empEntries,
            adjustments: countedAdjustments,
            from: startDate,
            to: endDate,
            adjustmentFrom: startDate,
            adjustmentTo: endDate,
          })
        : { worked: 0, soll: 0, generated: 0, usedZa: 0, corrections: 0, balance: 0 };

      map.set(empId, {
        employee: emp,
        ...balance,
        included,
        startDate: startDate || "",
        endDate: startDate ? endDate : "",
      });
    }
    return map;
  }, [rows, entries, overtimeAdjustments]);

  const zaMonthEndRows = useMemo(() => {
    {
      const accountEndDate = getYesterdayDateString();
      const monthEndResult = [];

      for (const emp of rows || []) {
        if (!isZaAccountEnabled(emp)) continue;

        const empId = String(emp.id);
        const empEntries = (entries || []).filter((row) => String(row.employee_id || "") === empId);
        const entryDates = empEntries.map((row) => dateOnly(row.work_date)).filter(Boolean).sort();
        const firstEntryDate = entryDates[0] || "";
        const lastEntryDate = entryDates[entryDates.length - 1] || "";
        const startDate = emp.za_start_date || firstEntryDate;
        if (!startDate) continue;

        const endDate = emp.disabled
          ? minDate(lastEntryDate || accountEndDate, accountEndDate)
          : accountEndDate;
        const countedAdjustments = (overtimeAdjustments || []).filter(
          (adj) => String(adj.employee_id || "") === empId && shouldCountZaAdjustment(adj, emp)
        );
        const calculation = calculateZaBalanceForEmployee({
          employee: emp,
          entries: empEntries,
          adjustments: countedAdjustments,
          from: startDate,
          to: endDate,
          adjustmentFrom: startDate,
          adjustmentTo: endDate,
        });

        const startBalance = countedAdjustments
          .filter(isOfficialZaStartAdjustment)
          .reduce((sum, adj) => sum + parseHours(adj.hours), 0);
        const previousDay = dayNumberToDate(dateToDayNumber(startDate) - 1);
        if (startBalance && isLastDayOfMonth(previousDay)) {
          monthEndResult.push({
            employeeId: empId,
            employee: emp,
            date: previousDay,
            worked: 0,
            soll: 0,
            usedZa: 0,
            generated: 0,
            corrections: startBalance,
            balance: startBalance,
            isStartStand: true,
          });
        }

        let worked = 0;
        let soll = 0;
        let usedZa = 0;
        let generated = 0;
        let corrections = 0;
        for (const day of calculation.days) {
          worked += day.worked;
          soll += day.soll;
          usedZa += day.usedZa;
          generated += day.generated;
          corrections += day.corrections || 0;
          if (!isLastDayOfMonth(day.date)) continue;
          monthEndResult.push({
            employeeId: empId,
            employee: emp,
            date: day.date,
            worked,
            soll,
            usedZa,
            generated,
            corrections,
            balance: generated + corrections,
          });
        }
      }

      return monthEndResult.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.employee?.name || "").localeCompare(String(b.employee?.name || "")));
    }
  }, [rows, entries, overtimeAdjustments]);

  const visibleZaMonthEndRows = useMemo(() => zaMonthEndRows.slice(0, 96), [zaMonthEndRows]);

  const officialZaStartByEmployee = useMemo(() => {
    const map = new Map();
    for (const adj of overtimeAdjustments || []) {
      if (!isOfficialZaStartAdjustment(adj)) continue;
      const empId = String(adj.employee_id || "");
      if (!empId) continue;
      map.set(empId, (map.get(empId) || 0) + parseHours(adj.hours));
    }
    return map;
  }, [overtimeAdjustments]);

  const latestZaMonthEndByEmployee = useMemo(() => {
    const map = new Map();
    for (const row of zaMonthEndRows || []) {
      const empId = String(row.employeeId || "");
      if (!empId) continue;
      const current = map.get(empId);
      if (!current || String(row.date) > String(current.date)) {
        map.set(empId, row);
      }
    }
    return map;
  }, [zaMonthEndRows]);

  async function loadOvertimeData(employeeRows = rows) {
    setOvertimeErr("");
    setOvertimeLoading(true);

    try {
      let entriesResponse = await supabase
        .from("time_entries")
        .select("*")
        .order("work_date", { ascending: true });

      if (entriesResponse.error) throw entriesResponse.error;
      setEntries(entriesResponse.data || []);

      const adjustmentsResponse = await supabase
        .from("overtime_adjustments")
        .select("*")
        .order("adjustment_date", { ascending: false })
        .limit(500);

      if (adjustmentsResponse.error) {
        setOvertimeAdjustments([]);
        setOvertimeErr("Überstunden-Korrekturen konnten nicht geladen werden. Bitte zuerst die SQL-Tabelle anlegen.");
      } else {
        setOvertimeAdjustments(adjustmentsResponse.data || []);
      }

      if (!adjustEmployeeId && employeeRows?.length) {
        setAdjustEmployeeId(String(employeeRows[0].id));
      }
    } catch (e) {
      setOvertimeErr(String(e?.message || e));
    } finally {
      setOvertimeLoading(false);
    }
  }

  async function saveOvertimeAdjustment(e) {
    e.preventDefault();
    setOvertimeErr("");

    const employeeId = String(adjustEmployeeId || "");
    const hours = parseHours(adjustHours);

    if (!employeeId) {
      setOvertimeErr("Bitte Mitarbeiter auswählen.");
      return;
    }

    if (!hours) {
      setOvertimeErr("Bitte Stunden eingeben, z. B. 8 oder -4,5.");
      return;
    }

    setAdjustSaving(true);
    try {
      const { error } = await supabase.from("overtime_adjustments").insert({
        employee_id: employeeId,
        adjustment_date: new Date().toISOString().slice(0, 10),
        hours,
        note: (adjustNote || "Manuelle Korrektur").trim(),
      });
      if (error) throw error;
      setAdjustHours("");
      setAdjustNote("");
      await loadOvertimeData(rows);
    } catch (e2) {
      setOvertimeErr(String(e2?.message || e2));
    } finally {
      setAdjustSaving(false);
    }
  }

  async function load() {
    setErr("");
    setLoading(true);

    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("name", { ascending: true });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    const nextRows = (data || []).map((row) => ({
      ...row,
      permissions: normalizePermissions(row.permissions),
      include_in_za_account: row.include_in_za_account !== false,
    }));
    setRows(nextRows);
    await loadOvertimeData(nextRows);
  }

  useEffect(() => {
    load();
  }, []);

  function randomPin() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function b64(s) {
    try {
      return btoa(s);
    } catch {
      return Buffer.from(s, "utf-8").toString("base64");
    }
  }

  function setPermission(key, checked) {
    setPermissions((prev) => ({
      ...prev,
      [key]: checked,
    }));
  }

  function setRecommendedPermissions(nextRole) {
    if (nextRole === "admin") {
      setPermissions({
        ...EMPTY_PERMISSIONS,
        writeOwnTime: true,
        writeAllTime: true,
        editOwnTime: true,
        editAllTime: true,
        deleteOwnTime: true,
        deleteAllTime: true,
        viewMonthlyOverview: true,
        viewYearOverview: true,
        viewAssignments: true,
        manageAssignments: true,
        manageProjects: true,
        manageEmployees: true,
      });
      return;
    }

    if (nextRole === "teamleiter") {
      setPermissions({
        ...EMPTY_PERMISSIONS,
        writeOwnTime: true,
        writeAllTime: true,
        editOwnTime: true,
        editAllTime: true,
        deleteOwnTime: true,
        deleteAllTime: true,
        viewMonthlyOverview: true,
        viewAssignments: true,
        manageAssignments: true,
      });
      return;
    }

    if (nextRole === "buchhaltung") {
      setPermissions({
        ...EMPTY_PERMISSIONS,
        viewMonthlyOverview: true,
        viewYearOverview: true,
      });
      setShowInDailyCheck(false);
      setWorkTimeModel("verwaltung");
      setWorkTimeSettings(normalizeWorkTimeSettings(DEFAULT_OFFICE_WORK_TIME_SETTINGS, "verwaltung"));
      return;
    }

    setPermissions({
      ...EMPTY_PERMISSIONS,
      writeOwnTime: true,
      editOwnTime: true,
    });
  }

  async function resetPin(row) {
    let pin = prompt(`Neue 4-stellige PIN für ${row.name}:`, "");
    if (pin === null) return;
    pin = (pin || "").trim() || randomPin();

    if (!/^\d{4}$/.test(pin)) {
      alert("Bitte genau 4 Ziffern eingeben.");
      return;
    }

    const { error } = await supabase
      .from("employees")
      .update({ pin: b64(pin), pin_hash: null })
      .eq("id", row.id);

    if (error) {
      alert("PIN konnte nicht gespeichert werden.");
      return;
    }

    alert(`Neue PIN für ${row.name}: ${pin}`);
    load();
  }

  async function toggleActive(row) {
    const nextDisabled = !row.disabled;

    const { error } = await supabase
      .from("employees")
      .update({
        disabled: nextDisabled,
        active: nextDisabled ? false : true,
      })
      .eq("id", row.id);

    if (error) {
      alert("Status konnte nicht geändert werden.");
      return;
    }

    load();
  }

  async function toggleZaAccount(row) {
    const nextValue = row.include_in_za_account === false;

    const { error } = await supabase
      .from("employees")
      .update({ include_in_za_account: nextValue })
      .eq("id", row.id);

    if (error) {
      alert("ZA-Konto Einstellung konnte nicht geändert werden. Bitte SQL-Spalte include_in_za_account prüfen.");
      return;
    }

    load();
  }

  async function remove(row) {
    if (!confirm(`Mitarbeiter „${row.name}“ wirklich löschen?`)) return;

    const { error } = await supabase.from("employees").delete().eq("id", row.id);

    if (error) {
      alert("Löschen fehlgeschlagen.");
      return;
    }

    load();
  }

  function editEmployee(row) {
    setEditId(row.id);
    setName(row.name || "");
    setCode(row.code || "");
    const nextModel = row.work_time_model || (String(row.role || "").toLowerCase() === "buchhaltung" ? "verwaltung" : "buak");
    setRole(row.role || "mitarbeiter");
    setPermissions(normalizePermissions(row.permissions));
    setShowInDailyCheck(row.show_in_daily_check !== false);
    setWorkTimeModel(nextModel);
    setWorkTimeSettings(normalizeWorkTimeSettings(row.work_time_settings, nextModel));
    setZaStartDate(row.za_start_date || "");
    setIncludeInZaAccount(row.include_in_za_account !== false);
  }

  function clearForm() {
    setEditId(null);
    setName("");
    setCode("");
    setRole("mitarbeiter");
    setPermissions({ ...EMPTY_PERMISSIONS });
    setShowInDailyCheck(true);
    setWorkTimeModel("buak");
    setWorkTimeSettings(normalizeWorkTimeSettings(DEFAULT_OFFICE_WORK_TIME_SETTINGS, "verwaltung"));
    setZaStartDate("");
    setIncludeInZaAccount(true);
  }

  function updateWorkTimeDay(day, patch) {
    setWorkTimeSettings((prev) => {
      const normalized = normalizeWorkTimeSettings(prev, workTimeModel);
      return {
        ...normalized,
        model: workTimeModel,
        days: {
          ...normalized.days,
          [day]: {
            ...normalized.days[day],
            ...patch,
          },
        },
      };
    });
  }

  function handleWorkTimeModelChange(nextModel) {
    setWorkTimeModel(nextModel);
    if (nextModel === "verwaltung") {
      setWorkTimeSettings(normalizeWorkTimeSettings(DEFAULT_OFFICE_WORK_TIME_SETTINGS, nextModel));
    } else if (nextModel === "individuell") {
      setWorkTimeSettings((prev) => normalizeWorkTimeSettings(prev, nextModel));
    }
  }

  async function createEmployee(e) {
    e.preventDefault();
    setErr("");
    setSaving(true);

    try {
      let error;

      const payload = {
        name,
        code,
        role,
        permissions,
        show_in_daily_check: role === "buchhaltung" ? false : showInDailyCheck,
        work_time_model: role === "buchhaltung" && workTimeModel === "buak" ? "verwaltung" : workTimeModel,
        work_time_settings: workTimeModel === "buak" ? null : workTimeSettings,
        za_start_date: zaStartDate || null,
        include_in_za_account: includeInZaAccount,
      };

      if (editId) {
        ({ error } = await supabase
          .from("employees")
          .update(payload)
          .eq("id", editId));
      } else {
        ({ error } = await supabase.from("employees").insert([
          {
            ...payload,
            active: true,
            disabled: false,
          },
        ]));
      }

      if (error) throw error;

      clearForm();
      await load();
    } catch (e2) {
      setErr(String(e2?.message || e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hbz-container">
      <div className="hbz-card employee-page-card">
        <div className="employee-page-head">
          <div>
            <div className="hbz-section-title">Verwaltung</div>
            <h2 className="page-title">Mitarbeiter</h2>
          </div>
        </div>

        <form onSubmit={createEmployee} className="employee-form-grid">
          <div>
            <label className="hbz-label">Name</label>
            <input
              className="hbz-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="hbz-label">Code</label>
            <input
              className="hbz-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="hbz-label">Rolle</label>
            <select
              className="hbz-input"
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value;
                setRole(nextRole);
                if (nextRole === "buchhaltung") setShowInDailyCheck(false);
              }}
            >              {ROLE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="hbz-label">Arbeitszeitmodell</label>
            <select
              className="hbz-input"
              value={workTimeModel}
              onChange={(e) => handleWorkTimeModelChange(e.target.value)}
            >
              {WORK_TIME_MODEL_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <div className="help" style={{ marginTop: 4 }}>
              BUAK bleibt wie bisher. Verwaltung/Individuell verwendet fixe Start-, Pausen- und Endzeiten.
            </div>
          </div>

          <div>
            <label className="hbz-label">Eintrittsdatum / Anmeldedatum</label>
            <input
              type="date"
              className="hbz-input"
              value={zaStartDate}
              onChange={(e) => setZaStartDate(e.target.value)}
            />
            <div className="help" style={{ marginTop: 4 }}>
              Ab diesem Datum wird das ZA-/Überstundenkonto berechnet. Leere Eingabe = ab erstem vorhandenen Eintrag.
            </div>
          </div>

          <div>
            <label className="hbz-label">ZA-Konto</label>
            <label className="employee-control-check" style={{ marginTop: 6 }}>
              <input
                type="checkbox"
                checked={includeInZaAccount}
                onChange={(e) => setIncludeInZaAccount(e.target.checked)}
              />
              <span>
                <strong>Im ZA-Konto prüfen</strong>
                <small>Wenn deaktiviert, wird diese Person im Überstunden-/ZA-Konto nicht berechnet.</small>
              </span>
            </label>
          </div>

          {workTimeModel !== "buak" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="hbz-label">Standardzeiten je Wochentag</label>
              <div
                style={{
                  border: "1px solid #e6ded2",
                  borderRadius: 14,
                  padding: 12,
                  background: "#fcfaf7",
                  display: "grid",
                  gap: 8,
                }}
              >
                {WEEKDAYS.map(([day, label]) => {
                  const d = normalizeWorkTimeSettings(workTimeSettings, workTimeModel).days[day];
                  return (
                    <div
                      key={day}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "130px 90px 120px 120px 120px",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <label className="employee-control-check" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={!!d.active}
                          onChange={(e) => updateWorkTimeDay(day, { active: e.target.checked })}
                        />
                        <span><strong>{label}</strong></span>
                      </label>
                      <span className="help">aktiv</span>
                      <input
                        type="time"
                        className="hbz-input"
                        value={d.start || ""}
                        disabled={!d.active}
                        onChange={(e) => updateWorkTimeDay(day, { start: e.target.value })}
                      />
                      <input
                        type="number"
                        min={0}
                        step={15}
                        className="hbz-input"
                        value={d.breakMinutes ?? 0}
                        disabled={!d.active}
                        onChange={(e) => updateWorkTimeDay(day, { breakMinutes: Number(e.target.value) || 0 })}
                        placeholder="Pause min"
                      />
                      <input
                        type="time"
                        className="hbz-input"
                        value={d.end || ""}
                        disabled={!d.active}
                        onChange={(e) => updateWorkTimeDay(day, { end: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="employee-form-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="save-btn" disabled={saving}>
              {saving ? "Speichere…" : editId ? "Änderungen speichern" : "Anlegen"}
            </button>

            {editId && (
              <button
                type="button"
                className="hbz-btn"
                onClick={clearForm}
              >
                Abbrechen
              </button>
            )}

            <button
              type="button"
              className="hbz-btn"
              onClick={() => setRecommendedPermissions(role)}
            >
              Rechte aus Rolle übernehmen
            </button>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="employee-control-check">
              <input
                type="checkbox"
                checked={showInDailyCheck}
                onChange={(e) => setShowInDailyCheck(e.target.checked)}
              />
              <span>
                <strong>In Tageskontrolle anzeigen</strong>
                <small>Wenn deaktiviert, wird diese Person bei „Wer fehlt?“ nicht mitgezählt.</small>
              </span>
            </label>
          </div>


          <div style={{ gridColumn: "1 / -1" }}>
            <label className="hbz-label">Rechte</label>
            <div
              style={{
                border: "1px solid #e6ded2",
                borderRadius: 14,
                padding: 14,
                background: "#fcfaf7",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10 }}>
                {PERMISSION_OPTIONS.map((item) => (
                  <label
                    key={item.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: permissions[item.key] ? "#f2e5d7" : "#fff",
                      border: permissions[item.key] ? "1px solid #d8b695" : "1px solid #ece4da",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!permissions[item.key]}
                      onChange={(e) => setPermission(item.key, e.target.checked)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
                Aktive Rechte: <strong>{activePermissionCount}</strong>
              </div>
            </div>
          </div>
        </form>

        {err && <div className="hbz-section error">{err}</div>}
      </div>

      <div className="hbz-card employee-page-card">
        <div className="employee-page-head">
          <div>
            <div className="hbz-section-title">Zeitausgleich</div>
            <h3 className="employee-page-title">Überstunden- / ZA-Konto</h3>
          </div>
          <button type="button" className="hbz-btn btn-small" onClick={() => loadOvertimeData(rows)} disabled={overtimeLoading}>
            {overtimeLoading ? "Aktualisiere…" : "Aktualisieren"}
          </button>
        </div>

        <form onSubmit={saveOvertimeAdjustment} className="employee-form-grid" style={{ marginBottom: 16 }}>
          <div>
            <label className="hbz-label">Mitarbeiter</label>
            <select className="hbz-input" value={adjustEmployeeId} onChange={(e) => setAdjustEmployeeId(e.target.value)}>
              {rows.map((r) => (
                <option key={r.id} value={String(r.id)}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="hbz-label">Korrektur Stunden</label>
            <input
              className="hbz-input"
              value={adjustHours}
              onChange={(e) => setAdjustHours(e.target.value)}
              placeholder="z. B. +8 oder -4,5"
            />
            <div className="help" style={{ marginTop: 4 }}>Plus erhöht das Konto, Minus zieht Stunden ab.</div>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label className="hbz-label">Notiz</label>
            <input
              className="hbz-input"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="z. B. Startwert per 01.06.2026 oder Korrektur Mai"
            />
          </div>

          <div className="employee-form-actions">
            <button className="save-btn" disabled={adjustSaving}>{adjustSaving ? "Speichere…" : "Korrektur speichern"}</button>
          </div>
        </form>

        {overtimeErr && <div className="hbz-section error">{overtimeErr}</div>}

        <div className="help" style={{ marginBottom: 10 }}>
          Eine gemeinsame Übersicht: offizieller Startstand laut Lohnverrechnung, Bewegung seit 01.06.2026,
          aktueller Stand und der letzte Monatsabschluss zur Kontrolle.
        </div>

        <div className="employee-table-wrap" style={{ overflowX: "auto" }}>
          <table className="employee-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>ZA-Konto</th>
                <th className="num">Start 31.05.</th>
                <th className="num">Bewegung seit 01.06.</th>
                <th className="num">Aktueller Stand</th>
                <th>Letzter Monatsabschluss</th>
                <th className="num">Stand Monatsende</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const balance = overtimeByEmployee.get(String(r.id));
                const zaEnabled = isZaAccountEnabled(r);
                const startBalance = officialZaStartByEmployee.get(String(r.id)) || 0;
                const currentBalance = balance?.balance || 0;
                const movementSinceStart = currentBalance - startBalance;
                const monthEnd = latestZaMonthEndByEmployee.get(String(r.id));
                return (
                  <tr key={`za-${r.id}`} style={{ opacity: r.disabled || !zaEnabled ? 0.5 : 1 }}>
                    <td>{r.name}</td>
                    <td>{zaEnabled ? "Wird geprüft" : "Nicht geprüft"}</td>
                    <td className="num">{zaEnabled ? formatHours(startBalance) : "—"}</td>
                    <td className="num">{zaEnabled ? formatHours(movementSinceStart) : "—"}</td>
                    <td className="num"><strong>{zaEnabled ? formatHours(currentBalance) : "—"}</strong></td>
                    <td>{zaEnabled && monthEnd ? `${formatDateAT(monthEnd.date)}${monthEnd.isStartStand ? " · Startstand" : ""}` : "—"}</td>
                    <td className="num"><strong>{zaEnabled && monthEnd ? formatHours(monthEnd.balance || 0) : "—"}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <details style={{ marginTop: 14 }}>
          <summary className="hbz-label" style={{ cursor: "pointer" }}>Berechnungsdetails anzeigen</summary>
          <div className="help" style={{ marginTop: 6, marginBottom: 10 }}>
            Diese Details sind nur zur Fehlersuche gedacht. Die normale Kontrolle erfolgt über die gemeinsame Übersicht oben.
          </div>
          <div className="employee-table-wrap" style={{ overflowX: "auto" }}>
            <table className="employee-table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Mitarbeiter</th>
                  <th>Startdatum</th>
                  <th className="num">Arbeitsstunden</th>
                  <th className="num">Soll</th>
                  <th className="num">ZA genommen</th>
                  <th className="num">Automatik</th>
                  <th className="num">Korrekturen</th>
                  <th className="num">Aktueller Stand</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const balance = overtimeByEmployee.get(String(r.id));
                  const zaEnabled = isZaAccountEnabled(r);
                  return (
                    <tr key={`za-detail-${r.id}`} style={{ opacity: r.disabled || !zaEnabled ? 0.5 : 1 }}>
                      <td>{r.name}</td>
                      <td>{r.za_start_date || "—"}</td>
                      <td className="num">{zaEnabled ? formatHours(balance?.worked || 0) : "—"}</td>
                      <td className="num">{zaEnabled ? formatHours(balance?.soll || 0) : "—"}</td>
                      <td className="num">{zaEnabled ? formatHours(-(balance?.usedZa || 0)) : "—"}</td>
                      <td className="num">{zaEnabled ? formatHours(balance?.generated || 0) : "—"}</td>
                      <td className="num">{zaEnabled ? formatHours(balance?.corrections || 0) : "—"}</td>
                      <td className="num"><strong>{zaEnabled ? formatHours(balance?.balance || 0) : "—"}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>

        <details style={{ marginTop: 14 }}>
          <summary className="hbz-label" style={{ cursor: "pointer" }}>Letzte manuelle Korrekturen anzeigen</summary>
          <div className="employee-table-wrap" style={{ marginTop: 10, overflowX: "auto" }}>
            <table className="employee-table" style={{ minWidth: 720 }}>
              <thead>
                <tr><th>Datum</th><th>Mitarbeiter</th><th className="num">Stunden</th><th>Notiz</th></tr>
              </thead>
              <tbody>
                {[...overtimeAdjustments].sort(sortByDateDesc).slice(0, 20).map((a) => {
                  const emp = rows.find((r) => String(r.id) === String(a.employee_id));
                  return <tr key={a.id}><td>{a.adjustment_date}</td><td>{emp?.name || a.employee_id}</td><td className="num">{formatHours(a.hours)}</td><td>{a.note || "—"}</td></tr>;
                })}
                {!overtimeAdjustments.length && <tr><td colSpan={4} className="employee-empty">Noch keine manuellen Korrekturen vorhanden.</td></tr>}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="hbz-card employee-page-card">
        <div className="employee-page-head">
          <h3 className="employee-page-title">Mitarbeiterliste</h3>
          <span className="badge-soft">{rows.length} Mitarbeiter</span>
        </div>

        {loading ? (
          <div className="text-sm opacity-70">Lade Mitarbeiter…</div>
        ) : (
          <div className="employee-table-wrap">
            <table className="employee-table" style={{ tableLayout: "fixed", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Mitarbeiter</th>
                  <th style={{ width: "19%" }}>Rolle / Modell</th>
                  <th style={{ width: "15%" }}>Eintritt / ZA</th>
                  <th style={{ width: "16%" }}>Status</th>
                  <th style={{ width: "17%" }}>Rechte</th>
                  <th className="num" style={{ width: "15%" }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="employee-empty">
                      Keine Mitarbeiter gefunden.
                    </td>
                  </tr>
                )}

                {rows.map((r) => {
                  const modelLabel = WORK_TIME_MODEL_OPTIONS.find((m) => m.value === (r.work_time_model || (String(r.role || "").toLowerCase() === "buchhaltung" ? "verwaltung" : "buak")))?.label || "BUAK / Zimmerer";
                  const zaEnabled = isZaAccountEnabled(r);
                  return (
                  <tr
                    key={r.id}
                    style={{
                      opacity: r.disabled ? 0.5 : 1,
                      background: r.disabled ? "#f5f1eb" : "transparent",
                    }}
                  >
                    <td>
                      <strong>{r.name}</strong>
                      <div className="help" style={{ marginTop: 3 }}>Code: {r.code || "—"}</div>
                    </td>
                    <td>
                      <strong>{roleLabel(r.role)}</strong>
                      <div className="help" style={{ marginTop: 3 }}>{modelLabel}</div>
                    </td>
                    <td>
                      <strong>{r.za_start_date || "—"}</strong>
                      <div className="help" style={{ marginTop: 3 }}>{zaEnabled ? "ZA geprüft" : "ZA nicht geprüft"}</div>
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: r.disabled ? "#e5ddd2" : "#e7f4ea",
                          color: r.disabled ? "#7b4a2d" : "#2f6b3a",
                          border: r.disabled ? "1px solid #d2c2b2" : "1px solid #cfe4d3",
                        }}
                      >
                        {r.disabled ? "deaktiviert" : "aktiv"}
                      </span>
                      <div style={{ marginTop: 6 }}>
                        <span className={`daily-check-table-pill ${r.show_in_daily_check === false ? "off" : "on"}`}>
                          {r.show_in_daily_check === false ? "Tageskontrolle aus" : "Tageskontrolle an"}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, lineHeight: 1.25 }}>
                      {permissionSummary(r.permissions)}
                    </td>
                    <td className="num" style={{ whiteSpace: "normal" }}>
                      <div className="employee-action-group" style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "flex-end" }}>
                        <button type="button" className="hbz-btn btn-small" onClick={() => editEmployee(r)}>Edit</button>
                        <button type="button" className="hbz-btn btn-small" onClick={() => toggleActive(r)}>{r.disabled ? "Aktiv" : "Deaktiv"}</button>
                        <button type="button" className="hbz-btn btn-small" onClick={() => toggleZaAccount(r)}>{zaEnabled ? "ZA aus" : "ZA an"}</button>
                        <button type="button" className="hbz-btn btn-small" onClick={() => resetPin(r)}>PIN</button>
                        <button type="button" className="hbz-btn btn-small" onClick={() => remove(r)}>Löschen</button>
                      </div>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
