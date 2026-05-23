import { useMemo, useState } from "react";
import { supabase } from "/src/lib/supabase.js";
import { DEFAULT_OFFICE_WORK_TIME_SETTINGS, normalizeWorkTimeSettings } from "/src/utils/time.js";

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

function b64(value) {
  try {
    return btoa(value);
  } catch {
    return Buffer.from(value, "utf-8").toString("base64");
  }
}

function calcDayHours(day) {
  if (!day?.active || !day.start || !day.end) return "0,00";
  const [sh, sm] = String(day.start).split(":").map((x) => parseInt(x || "0", 10));
  const [eh, em] = String(day.end).split(":").map((x) => parseInt(x || "0", 10));
  const start = (Number.isFinite(sh) ? sh : 0) * 60 + (Number.isFinite(sm) ? sm : 0);
  const end = (Number.isFinite(eh) ? eh : 0) * 60 + (Number.isFinite(em) ? em : 0);
  const pause = Number(day.breakMinutes ?? day.break_minutes ?? 0) || 0;
  return (Math.max(end - start - pause, 0) / 60).toFixed(2).replace(".", ",");
}

export default function EmployeeCreate() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("mitarbeiter");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [permissions, setPermissions] = useState({ ...EMPTY_PERMISSIONS });
  const [showInDailyCheck, setShowInDailyCheck] = useState(true);
  const [workTimeModel, setWorkTimeModel] = useState("buak");
  const [workTimeSettings, setWorkTimeSettings] = useState(() =>
    normalizeWorkTimeSettings(DEFAULT_OFFICE_WORK_TIME_SETTINGS, "verwaltung")
  );
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const me = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("employee") || "{}");
    } catch {
      return {};
    }
  }, []);
  const isAdmin = (me?.role || "").toLowerCase() === "admin";

  function applyRoleDefaults(nextRole) {
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
        writeOwnTime: true,
        editOwnTime: true,
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

  function togglePermission(key, checked) {
    setPermissions((prev) => ({
      ...prev,
      [key]: checked,
    }));
  }

  function handleRoleChange(nextRole) {
    setRole(nextRole);
    if (nextRole === "buchhaltung") {
      setShowInDailyCheck(false);
      setWorkTimeModel("verwaltung");
      setWorkTimeSettings(normalizeWorkTimeSettings(DEFAULT_OFFICE_WORK_TIME_SETTINGS, "verwaltung"));
    }
  }

  function handleWorkTimeModelChange(nextModel) {
    setWorkTimeModel(nextModel);
    if (nextModel === "verwaltung") {
      setWorkTimeSettings(normalizeWorkTimeSettings(DEFAULT_OFFICE_WORK_TIME_SETTINGS, nextModel));
    } else if (nextModel === "individuell") {
      setWorkTimeSettings((prev) => normalizeWorkTimeSettings(prev, nextModel));
    }
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

  function clearForm() {
    setName("");
    setRole("mitarbeiter");
    setCode("");
    setPin("");
    setPermissions({ ...EMPTY_PERMISSIONS });
    setShowInDailyCheck(true);
    setWorkTimeModel("buak");
    setWorkTimeSettings(normalizeWorkTimeSettings(DEFAULT_OFFICE_WORK_TIME_SETTINGS, "verwaltung"));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setOk("");

    if (!isAdmin) {
      setErr("Kein Zugriff: Nur Admins dürfen Mitarbeiter anlegen.");
      return;
    }

    try {
      const cleanPin = String(pin || "").trim();
      const payload = {
        name,
        role,
        code,
        active: true,
        disabled: false,
        permissions,
        show_in_daily_check: role === "buchhaltung" ? false : showInDailyCheck,
        work_time_model: role === "buchhaltung" && workTimeModel === "buak" ? "verwaltung" : workTimeModel,
        work_time_settings: workTimeModel === "buak" ? null : normalizeWorkTimeSettings(workTimeSettings, workTimeModel),
      };

      if (cleanPin) {
        payload.pin = b64(cleanPin);
      }

      const { error } = await supabase.from("employees").insert(payload);
      if (error) throw error;

      setOk("Mitarbeiter angelegt.");
      clearForm();
    } catch (ex) {
      setErr(ex.message || String(ex));
    }
  }

  if (!isAdmin) {
    return (
      <div className="hbz-container">
        <div className="hbz-card employee-page-card">
          <div className="employee-page-head">
            <h2 className="page-title">Mitarbeiter anlegen</h2>
          </div>
          <div className="hbz-section error">
            Kein Zugriff: Nur Admins dürfen Mitarbeiter anlegen oder verwalten.
          </div>
        </div>
      </div>
    );
  }

  const normalizedWorkTimeSettings = normalizeWorkTimeSettings(workTimeSettings, workTimeModel);

  return (
    <div className="hbz-container">
      <div className="hbz-card employee-page-card">
        <div className="employee-page-head">
          <div>
            <div className="hbz-section-title">Neu anlegen</div>
            <h2 className="page-title">Mitarbeiter anlegen</h2>
          </div>
        </div>

        {ok && <div className="employee-success-box">{ok}</div>}
        {err && <div className="hbz-section error">{err}</div>}

        <form onSubmit={handleSubmit} className="employee-form-grid">
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
            <label className="hbz-label">Rolle</label>
            <select
              className="hbz-input"
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
            >
              {ROLE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="hbz-label">Code</label>
            <input
              className="hbz-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          <div>
            <label className="hbz-label">PIN</label>
            <input
              className="hbz-input"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className="hbz-label">Arbeitszeitmodell</label>
            <div className="employee-worktime-header">
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
              <div className="help">
                BUAK/Zimmerer bleibt wie bisher. Verwaltung/Buchhaltung und Individuell verwenden fixe Start-, Pausen- und Endzeiten.
              </div>
            </div>
          </div>

          {workTimeModel !== "buak" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="hbz-label">Standardzeiten je Wochentag</label>
              <div className="employee-worktime-grid">
                <div className="employee-worktime-row employee-worktime-row-head">
                  <div>Tag</div>
                  <div>Start</div>
                  <div>Pause</div>
                  <div>Ende</div>
                  <div>Soll</div>
                </div>
                {WEEKDAYS.map(([day, label]) => {
                  const d = normalizedWorkTimeSettings.days[day];
                  return (
                    <div key={day} className="employee-worktime-row">
                      <label className="employee-control-check employee-worktime-day" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={!!d.active}
                          onChange={(e) => updateWorkTimeDay(day, { active: e.target.checked })}
                        />
                        <span><strong>{label}</strong></span>
                      </label>
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
                      />
                      <input
                        type="time"
                        className="hbz-input"
                        value={d.end || ""}
                        disabled={!d.active}
                        onChange={(e) => updateWorkTimeDay(day, { end: e.target.value })}
                      />
                      <div className="employee-worktime-hours">{calcDayHours(d)} h</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ gridColumn: "1 / -1" }}>
            <label className="employee-control-check">
              <input
                type="checkbox"
                checked={showInDailyCheck}
                onChange={(e) => setShowInDailyCheck(e.target.checked)}
                disabled={role === "buchhaltung"}
              />
              <span>
                <strong>In Tageskontrolle anzeigen</strong>
                <small>Wenn deaktiviert, wird diese Person bei „Wer fehlt?“ nicht mitgezählt.</small>
              </span>
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <label className="hbz-label" style={{ margin: 0 }}>Rechte</label>
              <button
                type="button"
                className="hbz-btn"
                onClick={() => applyRoleDefaults(role)}
              >
                Rechte aus Rolle übernehmen
              </button>
            </div>

            <div
              style={{
                border: "1px solid #e6ded2",
                borderRadius: 14,
                padding: 14,
                background: "#fcfaf7",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: 10,
              }}
            >
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
                    onChange={(e) => togglePermission(item.key, e.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="employee-form-actions">
            <button className="save-btn">Speichern</button>
            <button
              type="reset"
              className="hbz-btn"
              onClick={clearForm}
            >
              Zurücksetzen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
