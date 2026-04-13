import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState("mitarbeiter");
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState(null);

  async function load() {
    setErr("");
    setLoading(true);

    const { data, error } = await supabase
      .from("employees")
      .select("id, name, role, disabled, code")
      .order("name", { ascending: true });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setRows(data || []);
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
    setRole(row.role || "mitarbeiter");
  }

  function clearForm() {
    setEditId(null);
    setName("");
    setCode("");
    setRole("mitarbeiter");
  }

  async function createEmployee(e) {
    e.preventDefault();
    setErr("");
    setSaving(true);

    try {
      let error;

      if (editId) {
        ({ error } = await supabase
          .from("employees")
          .update({
            name,
            code,
            role,
          })
          .eq("id", editId));
      } else {
        ({ error } = await supabase.from("employees").insert([
          {
            name,
            code,
            role,
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
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="teamleiter">Teamleiter</option>
              <option value="admin">Admin</option>
            </select>
          </div>

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
                  <th>Status</th>
                  <th className="num">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="employee-empty">
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
                    <td>{r.role}</td>
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