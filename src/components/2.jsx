// src/components/MonthlyExport.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "/src/lib/supabase.js";


// Hilfsfunktionen
const pad2 = (n) => String(n).padStart(2, "0");
const toHHMM = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}h`;
const monthStartISO = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
const monthEndISO = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);

export default function MonthlyExport() {
  // Filter
  const [month, setMonth] = useState(monthStartISO());
  const [employeeId, setEmployeeId] = useState("");

  // Daten
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {type, text}

  // Mitarbeiter laden
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name")
        .eq("disabled", false)
        .order("name");
      if (!mounted) return;
      if (error) {
        setMsg({ type: "error", text: error.message });
      } else {
        setEmployees(data ?? []);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Einträge laden
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setMsg(null);

      const fromISO = month;
      const toISO = monthEndISO(new Date(month));

      let q = supabase
        .from("eintraege")
        .select(
          "id, employee_id, project_id, datum_date, start_min, end_min, pause_min, note"
        )
        .gte("datum_date", fromISO)
        .lt("datum_date", toISO)
        .order("datum_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (employeeId) q = q.eq("employee_id", employeeId);

      const { data, error } = await q;
      if (!mounted) return;
      if (error) setMsg({ type: "error", text: error.message });

      setEntries(data ?? []);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [month, employeeId]);

  // Gesamtdauer
  const totalMinutes = useMemo(
    () =>
      entries.reduce(
        (acc, r) => acc + Math.max(0, (r.end_min - r.start_min) - (r.pause_min || 0)),
        0
      ),
    [entries]
  );

  // PDF Export
  async function exportPDF() {
    try {
      setPdfBusy(true);

      // jsPDF im Browser korrekt als default importieren
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

      // Kopf
      const mDate = new Date(month);
      const monthName = mDate.toLocaleString("de-AT", { month: "long" });
      const year = mDate.getFullYear();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Monatsübersicht – Holzbau Zaunschirm GmbH", 10, 15);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(`Monat: ${monthName} ${year}`, 10, 25);
      if (employeeId) {
        const empName = employees.find((e) => e.id === employeeId)?.name || "";
        doc.text(`Mitarbeiter: ${empName}`, 10, 32);
      }

      // Tabellenkopf
      let y = 45;
      doc.setFont("helvetica", "bold");
      doc.text("Mitarbeiter", 10, y);
      doc.text("Datum", 65, y);
      doc.text("Start", 95, y);
      doc.text("Ende", 115, y);
      doc.text("Pause", 135, y);
      doc.text("Arbeitszeit", 155, y);
      y += 8;
      doc.setFont("helvetica", "normal");

      const ensurePage = () => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
      };

      // Zeilen
      entries.forEach((r) => {
        const emp = employees.find((e) => e.id === r.employee_id)?.name || "";
        const dateStr = new Date(r.datum_date).toLocaleDateString("de-AT");
        const workMin = Math.max(0, (r.end_min - r.start_min) - (r.pause_min || 0));

        doc.text(emp, 10, y);
        doc.text(dateStr, 65, y);
        doc.text(toHHMM(r.start_min), 95, y);
        doc.text(toHHMM(r.end_min), 115, y);
        doc.text(`${r.pause_min ?? 0}m`, 135, y);
        doc.text(toHHMM(workMin), 155, y);

        y += 8;
        ensurePage();
      });

      // Summe
      y += 4;
      ensurePage();
      doc.setFont("helvetica", "bold");
      doc.text(`Summe: ${toHHMM(totalMinutes)}`, 10, y);

      doc.save(
        `Monatsuebersicht_${String(mDate.getMonth() + 1).padStart(2, "0")}_${year}.pdf`
      );
    } catch (err) {
      console.error("Fehler beim PDF-Export:", err);
      alert("Fehler beim Erstellen der PDF. Siehe Konsole.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2" style={{ gap: 12, flexWrap: "wrap" }}>
        <h2>Monatsübersicht</h2>
        <button className="button" onClick={exportPDF} disabled={pdfBusy || loading}>
          {pdfBusy ? "PDF wird erstellt…" : "PDF exportieren"}
        </button>
      </div>

      {msg && (
        <p className="mt-1" style={{ color: msg.type === "error" ? "var(--danger)" : "var(--brand-dark)" }}>
          {msg.text}
        </p>
      )}

      {/* Filter */}
      <div className="form-grid mb-2">
        <label>Monat
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(`${e.target.value}-01`)}
          />
        </label>

        <label>Mitarbeiter
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Alle Mitarbeiter</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Tabelle (Vorschau) */}
      {loading ? (
        <p>Lade…</p>
      ) : entries.length === 0 ? (
        <p>Keine Einträge im gewählten Monat.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Datum</th>
                <th>Start</th>
                <th>Ende</th>
                <th>Pause</th>
                <th>Arbeitszeit</th>
                <th>Notiz</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((r) => {
                const emp = employees.find((e) => e.id === r.employee_id)?.name || "";
                const workMin = Math.max(0, (r.end_min - r.start_min) - (r.pause_min || 0));
                return (
                  <tr key={r.id}>
                    <td>{emp}</td>
                    <td>{new Date(r.datum_date).toLocaleDateString("de-AT")}</td>
                    <td>{toHHMM(r.start_min)}</td>
                    <td>{toHHMM(r.end_min)}</td>
                    <td>{r.pause_min ?? 0}m</td>
                    <td>{toHHMM(workMin)}</td>
                    <td>{r.note || ""}</td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={5}>Summe</td>
                <td>{toHHMM(totalMinutes)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
