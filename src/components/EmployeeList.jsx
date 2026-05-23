import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { DEFAULT_OFFICE_WORK_TIME_SETTINGS, normalizeWorkTimeSettings } from "../utils/time";

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

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState("mitarbeiter");
  const [permissions, setPermissions] = useState({ ...EMPTY_PERMISSIONS });
  const [showInDailyCheck, setShowInDailyCheck] = useState(true);
  const [workTimeModel, setWorkTimeModel] = useState("buak");
  const [workTimeSettings, setWorkTimeSettings] = useState(() => normalizeWorkTimeSettings(DEFAULT_OFFICE_WORK_TIME_SETTINGS));
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState(null);

  const activePermissionCount = useMemo(
    () => Object.values(permissions).filter(Boolean).length,
    [permissions]
  );

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

    setRows((data || []).map((row) => ({
      ...row,
      permissions: normalizePermissions(row.permissions),
    })));
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
          <h3 className="employee-page-title">Mitarbeiterliste</h3>
          <span className="badge-soft">{rows.length} Mitarbeiter</span>
        </div>

        {loading ? (
          <div className="text-sm opacity-70">Lade Mitarbeiter…</div>
        ) : (
          <div className="employee-table-wrap">
            <table className="employee-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Rolle</th>
                  <th>Arbeitszeitmodell</th>
                  <th>Rechte</th>
                  <th>Status</th>
                  <th>Tageskontrolle</th>
                  <th className="num">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="employee-empty">
                      Keine Mitarbeiter gefunden.
                    </td>
                  </tr>
                )}

                {rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{
                      opacity: r.disabled ? 0.5 : 1,
                      background: r.disabled ? "#f5f1eb" : "transparent",
                    }}
                  >
                    <td>{r.name}</td>
                    <td>{r.code}</td>
                    <td>{roleLabel(r.role)}</td>
                    <td>{WORK_TIME_MODEL_OPTIONS.find((m) => m.value === (r.work_time_model || (String(r.role || "").toLowerCase() === "buchhaltung" ? "verwaltung" : "buak")))?.label || "BUAK / Zimmerer"}</td>
                    <td style={{ minWidth: 240 }}>{permissionSummary(r.permissions)}</td>
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
                    </td>
                    <td>
                      <span className={`daily-check-table-pill ${r.show_in_daily_check === false ? "off" : "on"}`}>
                        {r.show_in_daily_check === false ? "Ausgeblendet" : "Wird geprüft"}
                      </span>
                    </td>
                    <td className="num">
                      <div className="employee-action-group">
                        <button
                          type="button"
                          className="hbz-btn btn-small"
                          onClick={() => editEmployee(r)}
                        >
                          Bearbeiten
                        </button>

                        <button
                          type="button"
                          className="hbz-btn btn-small"
                          onClick={() => toggleActive(r)}
                        >
                          {r.disabled ? "Aktivieren" : "Deaktivieren"}
                        </button>

                        <button
                          type="button"
                          className="hbz-btn btn-small"
                          onClick={() => resetPin(r)}
                        >
                          PIN zurücksetzen
                        </button>

                        <button
                          type="button"
                          className="hbz-btn btn-small"
                          onClick={() => remove(r)}
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
