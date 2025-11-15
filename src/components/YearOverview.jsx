import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ---- Helpers ----
const h2 = (m) => Math.round((m / 60) * 100) / 100;

function splitMinutes(r) {
  // robust: aus vorhandenen Feldern rechnen
  let work = r.work_minutes;
  let travel =
    r.travel_minutes ?? r.travel_min ?? r.travel ?? 0;

  if (work == null) {
    const start = r.start_min ?? r.from_min ?? 0;
    const end = r.end_min ?? r.to_min ?? 0;
    const pause = r.break_min ?? 0;
    work = Math.max(end - start - pause, 0);
  }

  const total =
    r.total_minutes != null ? r.total_minutes : work + (travel || 0);

  return { work, travel, total };
}

function getMonthRange(ym) {
  // ym = "YYYY-MM"
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
  const lastDay = new Date(y, m, 0).getDate();
  return {
    year: y,
    from: `${y}-${ym.slice(5)}-01`,
    to: `${y}-${ym.slice(5)}-${String(lastDay).padStart(2, "0")}`,
  };
}

export default function YearOverview() {
  const session = getSession()?.user || null;
  const role = (session?.role || "mitarbeiter").toLowerCase();
  const isAdmin = role === "admin";

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(
    2,
    "0"
  )}`;

  const [year, setYear] = useState(currentYear);
  const [monthFilter, setMonthFilter] = useState(""); // "" = gesamtes Jahr

  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Nur Admin darf Jahresübersicht sehen
  if (!isAdmin) {
    return (
      <div className="hbz-container">
        <div className="hbz-card">
          <h2 className="page-title">Jahresübersicht</h2>
          <p className="text-sm">
            Diese Auswertung ist nur für <b>Admin</b> sichtbar.
          </p>
        </div>
      </div>
    );
  }

  // Stammdaten laden
  useEffect(() => {
    (async () => {
      try {
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
      } catch (err) {
        console.error("Stammdaten Fehler:", err);
      }
    })();
  }, []);

  // Daten laden je nach Jahr/Monat/Filter
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthFilter, selectedCodes, selectedProjectId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      // Zeitraum bestimmen
      let from, to, effectiveYear;
      const mr = getMonthRange(monthFilter);
      if (mr) {
        from = mr.from;
        to = mr.to;
        effectiveYear = mr.year;
      } else {
        from = `${year}-01-01`;
        to = `${year}-12-31`;
        effectiveYear = year;
      }

      // IDs der gewählten Mitarbeiter
      const ids = employees
        .filter((e) => selectedCodes.includes(e.code))
        .map((e) => e.id);

      if (!ids.length) {
        setRows([]);
        setLoading(false);
        return;
      }

      let q = supabase
        .from("v_time_entries_expanded")
        .select("*")
        .gte("work_date", from)
        .lte("work_date", to)
        .in("employee_id", ids);

      if (selectedProjectId) q = q.eq("project_id", selectedProjectId);

      const { data, error } = await q
        .order("employee_name", { ascending: true })
        .order("work_date", { ascending: true });

      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      console.error("YearOverview load error:", e);
      setRows([]);
      setError(
        "Daten konnten nicht geladen werden. Bitte Konsole prüfen oder Filter anpassen."
      );
    } finally {
      setLoading(false);
    }
  }

  // Aktueller Zeitraum-Text
  const rangeLabel = useMemo(() => {
    const mr = getMonthRange(monthFilter);
    if (mr) {
      return `Monat ${monthFilter}`;
    }
    return `Jahr ${year}`;
  }, [monthFilter, year]);

  // Gruppierungen --------------------------------------------------

  // je Projekt
  const byProject = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const { work, travel, total } = splitMinutes(r);
      const name = r.project_name || r.project_code || r.project_id || "—";
      const code = r.project_code || "";
      const key = String(r.project_id || name);

      const e =
        map.get(key) || {
          id: r.project_id || key,
          name,
          code,
          work: 0,
          travel: 0,
          total: 0,
          cnt: 0,
        };

      e.work += work;
      e.travel += travel;
      e.total += total;
      e.cnt += 1;

      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  }, [rows]);

  // je Mitarbeiter
  const byEmployee = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const { work, travel, total } = splitMinutes(r);
      const key = r.employee_name || r.employee_id || "—";

      const e =
        map.get(key) || {
          name: key,
          work: 0,
          travel: 0,
          total: 0,
          cnt: 0,
        };

      e.work += work;
      e.travel += travel;
      e.total += total;
      e.cnt += 1;

      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [rows]);

  // Mitarbeiter × Projekt
  const byEmployeeProject = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const { work, travel, total } = splitMinutes(r);
      const emp = r.employee_name || r.employee_id || "—";
      const prj = r.project_name || r.project_code || r.project_id || "—";
      const key = `${emp}||${prj}`;

      const e =
        map.get(key) || {
          emp,
          prj,
          work: 0,
          travel: 0,
          total: 0,
          cnt: 0,
        };

      e.work += work;
      e.travel += travel;
      e.total += total;
      e.cnt += 1;

      map.set(key, e);
    }
    return Array.from(map.values()).sort(
      (a, b) => a.emp.localeCompare(b.emp) || a.prj.localeCompare(b.prj)
    );
  }, [rows]);

  // Gesamtsummen
  const totals = useMemo(() => {
    let work = 0,
      travel = 0,
      total = 0;
    for (const r of rows) {
      const m = splitMinutes(r);
      work += m.work;
      travel += m.travel;
      total += m.total;
    }
    return { workH: h2(work), travelH: h2(travel), totalH: h2(total) };
  }, [rows]);

  const hasData = rows.length > 0;

  // CSV Export ------------------------------------------------------
  function exportCSV() {
    const lines = [];
    lines.push(`Auswertung ${rangeLabel}`);
    lines.push("");

    // Abschnitt Projekte
    lines.push("PROJEKTE");
    lines.push(
      ["Projekt", "Arbeitsstunden", "Fahrzeit (h)", "Gesamt (h)", "Einträge"].join(
        ";"
      )
    );
    for (const p of byProject) {
      const label = p.code ? `${p.code} · ${p.name}` : p.name;
      lines.push(
        [
          label,
          h2(p.work).toFixed(2),
          h2(p.travel).toFixed(2),
          h2(p.total).toFixed(2),
          p.cnt,
        ].join(";")
      );
    }

    lines.push("");
    lines.push("MITARBEITER");
    lines.push(
      ["Mitarbeiter", "Arbeitsstunden", "Fahrzeit (h)", "Gesamt (h)", "Einträge"].join(
        ";"
      )
    );
    for (const e of byEmployee) {
      lines.push(
        [
          e.name,
          h2(e.work).toFixed(2),
          h2(e.travel).toFixed(2),
          h2(e.total).toFixed(2),
          e.cnt,
        ].join(";")
      );
    }
    lines.push(
      [
        "GESAMT",
        totals.workH.toFixed(2),
        totals.travelH.toFixed(2),
        totals.totalH.toFixed(2),
        "",
      ].join(";")
    );

    lines.push("");
    lines.push("MITARBEITER x PROJEKT");
    lines.push(
      [
        "Mitarbeiter",
        "Projekt",
        "Arbeitsstunden",
        "Fahrzeit (h)",
        "Gesamt (h)",
        "Einträge",
      ].join(";")
    );
    for (const r of byEmployeeProject) {
      lines.push(
        [
          r.emp,
          r.prj,
          h2(r.work).toFixed(2),
          h2(r.travel).toFixed(2),
          h2(r.total).toFixed(2),
          r.cnt,
        ].join(";")
      );
    }

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Auswertung_${rangeLabel.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // PDF Export ------------------------------------------------------
  function exportPDF() {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });
    doc.setFontSize(16);
    doc.text(`Auswertung ${rangeLabel}`, 40, 40);

    // Tabelle 1: Projekte
    autoTable(doc, {
      head: [
        [
          "Projekt",
          "Arbeitsstunden",
          "Fahrzeit (h)",
          "Gesamt (h)",
          "Einträge",
        ],
      ],
      body: byProject.map((p) => [
        p.code ? `${p.code} · ${p.name}` : p.name,
        h2(p.work).toFixed(2),
        h2(p.travel).toFixed(2),
        h2(p.total).toFixed(2),
        p.cnt,
      ]),
      startY: 60,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [123, 74, 45] },
      margin: { left: 40, right: 40 },
    });

    let y = doc.lastAutoTable.finalY + 18;
    doc.setFontSize(11);
    doc.text(
      `Summen – Arbeit: ${totals.workH.toFixed(
        2
      )} h | Fahrzeit: ${totals.travelH.toFixed(
        2
      )} h | Gesamt: ${totals.totalH.toFixed(2)} h`,
      40,
      y
    );

    // Tabelle 2: Mitarbeiter
    y += 16;
    autoTable(doc, {
      head: [
        [
          "Mitarbeiter",
          "Arbeitsstunden",
          "Fahrzeit (h)",
          "Gesamt (h)",
          "Einträge",
        ],
      ],
      body: byEmployee.map((e) => [
        e.name,
        h2(e.work).toFixed(2),
        h2(e.travel).toFixed(2),
        h2(e.total).toFixed(2),
        e.cnt,
      ]),
      startY: y,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [220, 220, 220] },
      margin: { left: 40, right: 40 },
    });

    // Tabelle 3: Mitarbeiter x Projekt
    y = doc.lastAutoTable.finalY + 20;
    autoTable(doc, {
      head: [
        [
          "Mitarbeiter",
          "Projekt",
          "Arbeitsstunden",
          "Fahrzeit (h)",
          "Gesamt (h)",
          "Einträge",
        ],
      ],
      body: byEmployeeProject.map((r) => [
        r.emp,
        r.prj,
        h2(r.work).toFixed(2),
        h2(r.travel).toFixed(2),
        h2(r.total).toFixed(2),
        r.cnt,
      ]),
      startY: y,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [240, 240, 240] },
      margin: { left: 40, right: 40 },
    });

    doc.save(`Auswertung_${rangeLabel.replace(/\s+/g, "_")}.pdf`);
  }

  // Button-Handler --------------------------------------------------
  const handleCurrentMonth = () => {
    setMonthFilter(currentMonthStr);
    setYear(currentYear);
  };

  const handleLastMonth = () => {
    let y = currentYear;
    let m = currentMonth - 1;
    if (m === 0) {
      m = 12;
      y = currentYear - 1;
    }
    const val = `${y}-${String(m).padStart(2, "0")}`;
    setMonthFilter(val);
    setYear(y);
  };

  const handleCurrentYear = () => {
    setYear(currentYear);
    setMonthFilter("");
  };

  // Render ----------------------------------------------------------
  return (
    <div className="max-w-screen-xl mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* Jahr-Auswahl */}
        <div>
          <label className="block text-sm font-semibold">Jahr</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="px-3 py-2 rounded border"
          >
            {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Projektfilter */}
        <div>
          <label className="block text-sm font-semibold">Projekt</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 rounded border min-w-[240px]"
          >
            <option value="">Alle</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} · ${p.name}` : p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Mitarbeiterfilter */}
        <div className="flex-1">
          <label className="block text-sm font-semibold">
            Mitarbeiter (Mehrfachauswahl)
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {employees.map((e) => {
              const active = selectedCodes.includes(e.code);
              return (
                <button
                  key={e.id}
                  type="button"
                  className={`px-2 py-1 rounded border ${
                    active ? "bg-[#7b4a2d] text-white" : ""
                  }`}
                  onClick={() => {
                    setSelectedCodes((prev) =>
                      prev.includes(e.code)
                        ? prev.filter((c) => c !== e.code)
                        : [...prev, e.code]
                    );
                  }}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Export-Buttons */}
        <div className="ml-auto flex flex-col gap-2">
          <button
            onClick={exportPDF}
            className="px-3 py-2 rounded border"
            disabled={!hasData}
          >
            PDF export
          </button>
          <button
            onClick={exportCSV}
            className="px-3 py-2 rounded border"
            disabled={!hasData}
          >
            CSV export
          </button>
        </div>
      </div>

      {/* Zeitraum-Buttons */}
      <div className="hbz-card" style={{ marginBottom: 10 }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm font-semibold">Zeitraum:</div>

          <button
            type="button"
            className="hbz-btn btn-small"
            onClick={handleCurrentMonth}
          >
            Aktueller Monat
          </button>

          <button
            type="button"
            className="hbz-btn btn-small"
            onClick={handleLastMonth}
          >
            Letzter Monat
          </button>

          <div className="flex items-center gap-1">
            <span className="text-xs opacity-75">Monat auswählbar:</span>
            <input
              type="month"
              className="hbz-input"
              style={{ maxWidth: 150 }}
              value={monthFilter}
              onChange={(e) => {
                const v = e.target.value;
                setMonthFilter(v);
                const mr = getMonthRange(v);
                if (mr) setYear(mr.year);
              }}
            />
          </div>

          <button
            type="button"
            className="hbz-btn btn-small"
            onClick={handleCurrentYear}
          >
            Aktuelles Jahr
          </button>

          <div className="ml-auto text-sm opacity-80">
            Aktuell: <b>{rangeLabel}</b>
          </div>
        </div>
      </div>

      {/* Hauptkarte mit Tabellen */}
      <div className="hbz-card">
        <div
          className="px-2 py-2 font-semibold"
          style={{ background: "#f6eee4", borderRadius: 8 }}
        >
          {loading
            ? "Lade…"
            : `Auswertung ${rangeLabel} – Arbeit: ${totals.workH.toFixed(
                2
              )} h · Fahrzeit: ${totals.travelH.toFixed(
                2
              )} h · Gesamt: ${totals.totalH.toFixed(2)} h`}
        </div>

        {error && (
          <div className="mt-2 text-sm text-red-700">
            <b>Hinweis:</b> {error}
          </div>
        )}

        {!hasData && !loading && (
          <div className="text-sm opacity-70 mt-3">
            Keine Einträge für diese Filter.
          </div>
        )}

        {hasData && (
          <>
            {/* Tabelle: je Projekt */}
            <div className="mt-4 mo-wrap">
              <h3 className="text-base font-semibold mb-2">
                Stunden je Projekt
              </h3>
              <table className="nice mo-table">
                <thead>
                  <tr>
                    <th>Projekt</th>
                    <th style={{ textAlign: "right" }}>Arbeitsstunden</th>
                    <th style={{ textAlign: "right" }}>Fahrzeit (h)</th>
                    <th style={{ textAlign: "right" }}>Gesamt (h)</th>
                    <th style={{ textAlign: "right" }}>Einträge</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.code ? `${p.code} · ${p.name}` : p.name}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {h2(p.work).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {h2(p.travel).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {h2(p.total).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>{p.cnt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tabelle: je Mitarbeiter */}
            <div className="mt-6 mo-wrap">
              <h3 className="text-base font-semibold mb-2">
                Stunden je Mitarbeiter
              </h3>
              <table className="nice mo-table">
                <thead>
                  <tr>
                    <th>Mitarbeiter</th>
                    <th style={{ textAlign: "right" }}>Arbeitsstunden</th>
                    <th style={{ textAlign: "right" }}>Fahrzeit (h)</th>
                    <th style={{ textAlign: "right" }}>Gesamt (h)</th>
                    <th style={{ textAlign: "right" }}>Einträge</th>
                  </tr>
                </thead>
                <tbody>
                  {byEmployee.map((e) => (
                    <tr key={e.name}>
                      <td>{e.name}</td>
                      <td style={{ textAlign: "right" }}>
                        {h2(e.work).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {h2(e.travel).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {h2(e.total).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>{e.cnt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tabelle: Mitarbeiter × Projekt */}
            <div className="mt-6 mo-wrap">
              <h3 className="text-base font-semibold mb-2">
                Aufschlüsselung je Mitarbeiter und Projekt
              </h3>
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
                  {byEmployeeProject.map((r) => (
                    <tr key={`${r.emp}||${r.prj}`}>
                      <td>{r.emp}</td>
                      <td>{r.prj}</td>
                      <td style={{ textAlign: "right" }}>
                        {h2(r.work).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {h2(r.travel).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {h2(r.total).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>{r.cnt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
