import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ---- Helpers ----
const toHM = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const h2 = (m) => Math.round((m / 60) * 100) / 100;
const yRange = (year) => [`${year}-01-01`, `${year}-12-31`];

export default function YearOverview() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Stammdaten laden
  useEffect(() => {
    (async () => {
      const { data: e } = await supabase
        .from("employees")
        .select("id, code, name, active, disabled")
        .eq("active", true)
        .eq("disabled", false)
        .order("name");
      setEmployees(e || []);
      setSelectedCodes((e || []).map((x) => x.code));

      const { data: p } = await supabase
        .from("projects")
        .select("id, code, name, active")
        .order("name");
      setProjects((p || []).filter((x) => x?.active !== false));
    })();
  }, []);

  // Jahresdaten laden
  useEffect(() => { loadYear(); /* eslint-disable-next-line */ }, [year, selectedCodes, selectedProjectId]);

  async function loadYear() {
    setLoading(true);
    try {
      const [from, to] = yRange(year);

      // IDs der gewählten Mitarbeiter
      const ids = employees.filter((e) => selectedCodes.includes(e.code)).map((e) => e.id);
      if (!ids.length) { setRows([]); setLoading(false); return; }

      let q = supabase
        .from("v_time_entries_expanded")
        .select("*")
        .gte("work_date", from)
        .lte("work_date", to)
        .in("employee_id", ids);

      if (selectedProjectId) q = q.eq("project_id", selectedProjectId);

      const { data, error } = await q.order("employee_name", { ascending: true }).order("work_date", { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      console.error("Year load error:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Gruppierungen
  const byEmployee = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.employee_name || r.employee_id;
      const e = map.get(key) || { name: key, work: 0, travel: 0, total: 0, items: [] };
      e.work += (r.work_minutes || 0);
      e.travel += (r.travel_minutes || 0);
      e.total += (r.total_minutes || ((r.work_minutes || 0) + (r.travel_minutes || 0)));
      e.items.push(r);
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const byEmployeeProject = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const emp = r.employee_name || r.employee_id;
      const prj = r.project_name || r.project_code || r.project_id || "—";
      const key = `${emp}||${prj}`;
      const e = map.get(key) || { emp, prj, work: 0, travel: 0, total: 0, cnt: 0 };
      e.work += (r.work_minutes || 0);
      e.travel += (r.travel_minutes || 0);
      e.total += (r.total_minutes || ((r.work_minutes || 0) + (r.travel_minutes || 0)));
      e.cnt += 1;
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.emp.localeCompare(b.emp) || a.prj.localeCompare(b.prj)
    );
  }, [rows]);

  const totals = useMemo(() => {
    let work = 0, travel = 0, total = 0;
    for (const r of rows) {
      work += (r.work_minutes || 0);
      travel += (r.travel_minutes || 0);
      total += (r.total_minutes || ((r.work_minutes || 0) + (r.travel_minutes || 0)));
    }
    return { workH: h2(work), travelH: h2(travel), totalH: h2(total) };
  }, [rows]);

  // CSV Export
  function exportCSV() {
    const lines = [];
    lines.push(`Jahresübersicht ${year}`);
    lines.push("");
    lines.push(["Mitarbeiter","Arbeitsstunden","Fahrzeit (h)","Gesamt (h)"].join(";"));
    for (const e of byEmployee) {
      lines.push([e.name, h2(e.work).toFixed(2), h2(e.travel).toFixed(2), h2(e.total).toFixed(2)].join(";"));
    }
    lines.push(["GESAMT", totals.workH.toFixed(2), totals.travelH.toFixed(2), totals.totalH.toFixed(2)].join(";"));

    lines.push("");
    lines.push(["Mitarbeiter","Projekt","Arbeitsstunden","Fahrzeit (h)","Gesamt (h)","Einträge"].join(";"));
    for (const r of byEmployeeProject) {
      lines.push([r.emp, r.prj, h2(r.work).toFixed(2), h2(r.travel).toFixed(2), h2(r.total).toFixed(2), r.cnt].join(";"));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Jahresuebersicht_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // PDF Export
  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(16);
    doc.text(`Jahresübersicht ${year}`, 40, 40);

    // Tabelle 1: je Mitarbeiter
    autoTable(doc, {
      head: [["Mitarbeiter", "Arbeitsstunden", "Fahrzeit (h)", "Gesamt (h)"]],
      body: byEmployee.map(e => [e.name, h2(e.work).toFixed(2), h2(e.travel).toFixed(2), h2(e.total).toFixed(2)]),
      startY: 60,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [123, 74, 45] },
      margin: { left: 40, right: 40 },
    });

    // Summenzeile
    const y = doc.lastAutoTable.finalY + 18;
    doc.setFontSize(12);
    doc.text(
      `Summen – Arbeit: ${totals.workH.toFixed(2)} h | Fahrzeit: ${totals.travelH.toFixed(2)} h | Gesamt: ${totals.totalH.toFixed(2)} h`,
      40, y
    );

    // Tabelle 2: Mitarbeiter × Projekt
    autoTable(doc, {
      head: [["Mitarbeiter", "Projekt", "Arbeitsstunden", "Fahrzeit (h)", "Gesamt (h)", "Einträge"]],
      body: byEmployeeProject.map(r => [r.emp, r.prj, h2(r.work).toFixed(2), h2(r.travel).toFixed(2), h2(r.total).toFixed(2), r.cnt]),
      startY: y + 16,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [220, 220, 220] },
      margin: { left: 40, right: 40 },
    });

    doc.save(`Jahresuebersicht_${year}.pdf`);
  }

  return (
    <div className="max-w-screen-xl mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-sm font-semibold">Jahr</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="px-3 py-2 rounded border"
          >
            {Array.from({ length: 8 }, (_, i) => now.getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold">Projekt</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 rounded border min-w-[240px]"
          >
            <option value="">Alle</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.code ? `${p.code} · ${p.name}` : p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-sm font-semibold">Mitarbeiter (Mehrfachauswahl)</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {employees.map(e => {
              const active = selectedCodes.includes(e.code);
              return (
                <button
                  key={e.id}
                  className={`px-2 py-1 rounded border ${active ? "bg-[#7b4a2d] text-white" : ""}`}
                  onClick={() => {
                    setSelectedCodes(prev =>
                      prev.includes(e.code) ? prev.filter(c => c !== e.code) : [...prev, e.code]
                    );
                  }}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ml-auto flex gap-2">
          <button onClick={exportPDF} className="px-3 py-2 rounded border">PDF export</button>
          <button onClick={exportCSV} className="px-3 py-2 rounded border">CSV export</button>
        </div>
      </div>

      <div className="hbz-card">
        <div className="px-2 py-2 font-semibold" style={{ background: "#f6eee4", borderRadius: 8 }}>
          {loading ? "Lade…" : `Jahressummen ${year}`}
        </div>

        {/* Tabelle: je Mitarbeiter */}
        <div className="mo-wrap">
          <table className="nice mo-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th style={{ textAlign: "right" }}>Arbeitsstunden</th>
                <th style={{ textAlign: "right" }}>Fahrzeit (h)</th>
                <th style={{ textAlign: "right" }}>Gesamt (h)</th>
              </tr>
            </thead>
            <tbody>
              {byEmployee.map(e => (
                <tr key={e.name}>
                  <td>{e.name}</td>
                  <td style={{ textAlign: "right" }}>{h2(e.work).toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{h2(e.travel).toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{h2(e.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>GESAMT</th>
                <th style={{ textAlign: "right" }}>{totals.workH.toFixed(2)}</th>
                <th style={{ textAlign: "right" }}>{totals.travelH.toFixed(2)}</th>
                <th style={{ textAlign: "right" }}>{totals.totalH.toFixed(2)}</th>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Tabelle: Mitarbeiter × Projekt */}
        <div className="mt-6 mo-wrap">
          <h3 className="text-base font-semibold mb-2">Aufschlüsselung je Projekt</h3>
          <table className="nice mo-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Projekt</th>
                <th style={{ textAlign: "right" }}>Arbeitsstunden</th>
                <th style={{ textAlign: "right" }}>Fahrzeit (h)</th>
                <th style={{ textAlign: "right" }}>Gesamt (h)</th>
                <th style={{ textAlign: "right" }}>Einträge</th>
              </tr>
            </thead>
            <tbody>
              {byEmployeeProject.map(r => (
                <tr key={`${r.emp}||${r.prj}`}>
                  <td>{r.emp}</td>
                  <td>{r.prj}</td>
                  <td style={{ textAlign: "right" }}>{h2(r.work).toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{h2(r.travel).toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{h2(r.total).toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{r.cnt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
