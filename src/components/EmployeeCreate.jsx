import { useMemo, useState } from "react";
import { supabase } from "/src/lib/supabase.js";

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

export default function EmployeeCreate() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("mitarbeiter");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [permissions, setPermissions] = useState({ ...EMPTY_PERMISSIONS });
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

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setOk("");

    if (!isAdmin) {
      setErr("Kein Zugriff: Nur Admins dürfen Mitarbeiter anlegen.");
      return;
    }

    try {
      const encoded = btoa(pin);
      const { error } = await supabase.from("employees").insert({
        name,
        role,
        code,
        pin: encoded,
        active: true,
        permissions,
      });
      if (error) throw error;

      setOk("Mitarbeiter angelegt.");
      setName("");
      setRole("mitarbeiter");
      setCode("");
      setPin("");
      setPermissions({ ...EMPTY_PERMISSIONS });
    } catch (ex) {
      setErr(ex.message);
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
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="teamleiter">Teamleiter</option>
              <option value="admin">Admin</option>
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
              onClick={() => {
                setName("");
                setRole("mitarbeiter");
                setCode("");
                setPin("");
                setPermissions({ ...EMPTY_PERMISSIONS });
              }}
            >
              Zurücksetzen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
