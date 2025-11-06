import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function EmployeeList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, role, active, disabled, code")
      .order("name", { ascending: true });
    setLoading(false);
    if (error) {
      console.error(error);
      alert("Fehler beim Laden der Mitarbeiter.");
      return;
    }
    setRows(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  // einfache PIN-Erzeugung
  function generatePin() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  // Base64-Helper (Fallback für alte PIN-Felder)
  function toBase64(s) {
    try {
      return btoa(s);
    } catch {
      return Buffer.from(s, "utf-8").toString("base64");
    }
  }

  async function resetPin(row) {
    let newPin = prompt(
      `Neue 4-stellige PIN für ${row.name} eingeben (leer lassen für Zufalls-PIN):`,
      ""
    );
    if (newPin === null) return;
    newPin = (newPin || "").trim() || generatePin();
    if (!/^\d{4}$/.test(newPin)) {
      alert("Bitte 4-stellige Ziffern eingeben!");
      return;
    }

    const { error } = await supabase
      .from("employees")
      .update({ pin: toBase64(newPin), pin_hash: null })
      .eq("id", row.id);

    if (error) {
      console.error(error);
      alert("PIN konnte nicht gespeichert werden!");
      return;
    }
    alert(`Neue PIN für ${row.name}: ${newPin}`);
    load();
  }

  async function remove(row) {
    if (!confirm(`Mitarbeiter "${row.name}" wirklich löschen?`)) return;
    const { error } = await supabase.from("employees").delete().eq("id", row.id);
    if (error) {
      console.error(error);
      alert("Löschen fehlgeschlagen – ggf. Supabase RLS prüfen.");
      return;
    }
    load();
  }

  return (
    <div className="rounded-xl bg-white/70 p-4 shadow">
      <h2 className="text-lg font-semibold mb-3">Mitarbeiter</h2>

      {loading && <p>Lade Mitarbeiter…</p>}

      {!loading && (
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-neutral-600">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Rolle</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Code</th>
              <th className="text-right px-3 py-2">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center py-3 text-neutral-500">
                  Keine Mitarbeiter gefunden.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-neutral-200 hover:bg-neutral-50"
              >
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.role}</td>
                <td className="px-3 py-2">
                  {r.disabled ? (
                    <span className="text-red-600">inaktiv</span>
                  ) : (
                    <span className="text-green-700">aktiv</span>
                  )}
                </td>
                <td className="px-3 py-2">{r.code}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button
                    onClick={() => resetPin(r)}
                    className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-800 hover:bg-amber-200"
                  >
                    PIN zurücksetzen
                  </button>
                  <button
                    onClick={() => remove(r)}
                    className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200"
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
