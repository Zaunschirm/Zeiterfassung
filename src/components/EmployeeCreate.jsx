import { useMemo, useState } from "react";
import { supabase } from "/src/lib/supabase.js";

export default function EmployeeCreate() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("mitarbeiter");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
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
      });
      if (error) throw error;

      setOk("Mitarbeiter angelegt.");
      setName("");
      setRole("mitarbeiter");
      setCode("");
      setPin("");
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