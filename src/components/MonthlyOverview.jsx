import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ---------- Utils ----------
const toHM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(
    2,
    "0"
  )}`;
const hmToMin = (hm) => {
  if (!hm) return 0;
  const [h, m] = String(hm).split(":").map((x) => parseInt(x || "0", 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};
const h2 = (m) => Math.round((m / 60) * 100) / 100;

// Minuten einer Zeile (Arbeitszeit + Fahrzeit; Pause wird abgezogen)
const getTravel = (e) => e.travel_minutes ?? e.travel_min ?? 0;
const entryMinutes = (e) => {
  const start = e.start_min ?? e.from_min ?? 0;
  const end = e.end_min ?? e.to_min ?? 0;
  const pause = e.break_min || 0;
  const work = Math.max(end - start - pause, 0);
  const travel = getTravel(e);
  return work + (travel || 0);
};

// ISO-Week helpers
function parseYMD(ymd) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}
function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return { week: weekNo, year: dt.getUTCFullYear() };
}
const weekKey = (ymd) => {
  const id = isoWeek(parseYMD(ymd));
  return `${id.year}-W${String(id.week).padStart(2, "0")}`;
};

// ---------- Component ----------
export default function MonthlyOverview() {
  const session = getSession()?.user || null;
  const role = (session?.role || "mitarbeiter").toLowerCase();
  const isStaff = role === "mitarbeiter";
  const isManager = !isStaff;

  // Monat (YYYY-MM)
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Stammdaten/Filter
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState(
    isStaff ? [session?.code].filter(Boolean) : []
  );
  const [selectedProjectId, setSelectedProjectId] = useState("");

  // Daten
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // v_time_entries_expanded
  const [editId, setEditId] = useState(null);
  const [editState, setEditState] = useState(null);

  // Desktop / Mobile Umschaltung für Tabelle vs. Karten
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Abgeleitet: aktuell ausgewählte Mitarbeiter (für Anzeige wie bei Zeiterfassung)
  const selectedEmployees = useMemo(
    () => employees.filter((e) => selectedCodes.includes(e.code)),
    [employees, selectedCodes]
  );

  // ----- Stammdaten -----
  useEffect(() => {
    (async () => {
      // Employees
      if (isManager) {
        const { data, error } = await supabase
          .from("employees")
          .select("id, code, name, role, active, disabled")
          .eq("active", true)
          .eq("disabled", false)
          .order("name", { ascending: true });
        if (!error) {
          setEmployees(data || []);
          // Standard: nur sich selbst anzeigen (wie Zeiterfassung)
          if ((data || []).length && selectedCodes.length === 0) {
            if (session?.code) {
              const me = (data || []).find((e) => e.code === session.code);
              if (me) {
                setSelectedCodes([me.code]);
              } else {
                setSelectedCodes(data.map((e) => e.code));
              }
            } else {
              setSelectedCodes(data.map((e) => e.code));
            }
          }
        }
      } else {
        const { data, error } = await supabase
          .from("employees")
          .select("id, code, name, role, active, disabled")
          .eq("code", session?.code)
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          setEmployees([data]);
          setSelectedCodes([data.code]);
        }
      }

      // Projects (robust, wie vorhanden)
      const tryList = async (source) => {
        const { data, error } = await supabase
          .from(source)
          .select("*")
          .order("name", { ascending: true });
        if (error) return { ok: false, data: [] };
        return { ok: true, data: data || [] };
      };
      let prj = await tryList("projects");
      if (!prj.ok || prj.data.length === 0) {
        for (const fb of ["v_projects", "projects_view", "projects_all"]) {
          const r = await tryList(fb);
          if (r.ok && r.data.length > 0) {
            prj = r;
            break;
          }
        }
      }
      setProjects((prj.data || []).filter((p) => p?.disabled !== true));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  // ----- Monatsdaten laden -----
  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, selectedCodes, selectedProjectId, isManager]);

  async function loadMonth() {
    try {
      setLoading(true);
      const [y, m] = month.split("-");
      const from = `${y}-${m}-01`;
      const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
      const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

      let ids = [];
      if (isManager) {
        ids = employees
          .filter((e) => selectedCodes.includes(e.code))
          .map((e) => e.id);
        if (!ids.length) {
          setRows([]);
          setLoading(false);
          return;
        }
      }

      let q = supabase
        .from("v_time_entries_expanded")
        .select("*")
        .gte("work_date", from)
        .lte("work_date", to);

      if (isManager) q = q.in("employee_id", ids);
      else {
        const me = employees[0];
        if (me?.id) q = q.eq("employee_id", me.id);
      }
      if (selectedProjectId) q = q.eq("project_id", selectedProjectId);

      let { data, error } = await q
        .order("employee_name", { ascending: true })
        .order("work_date", { ascending: true });
      if (error?.code === "42703") {
        const retry = await q
          .order("work_date", { ascending: true })
          .order("id", { ascending: true });
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      console.error("month load error:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Handy/Browser: bei Rückkehr in die App Monatsdaten neu laden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadMonth();
      }
    };

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Gruppierungen -----
  const grouped = useMemo(() => {
    const g = {};
    for (const r of rows) {
      const key = `${r.employee_name || r.employee_id}||${r.work_date}`;
      const mins = entryMinutes(r);
      const travel = getTravel(r);
      if (!g[key]) g[key] = { ...r, _mins: 0, _travel: 0, items: [] };
      g[key]._mins += mins;
      g[key]._travel += travel || 0;
      g[key].items.push(r);
    }
    return Object.values(g).sort(
      (a, b) =>
        (a.employee_name || "").localeCompare(b.employee_name || "") ||
        a.work_date.localeCompare(b.work_date)
    );
  }, [rows]);

  const weekly = useMemo(() => {
    const w = {};
    for (const r of grouped) {
      const wk = weekKey(r.work_date);
      const emp = r.employee_name || r.employee_id;
      const key = `${emp}||${wk}`;
      if (!w[key])
        w[key] = { employee: emp, weekKey: wk, days: [], _mins: 0, _travel: 0 };
      w[key].days.push(r);
      w[key]._mins += r._mins;
      w[key]._travel += r._travel;
    }
    return Object.values(w).sort(
      (a, b) =>
        a.employee.localeCompare(b.employee) ||
        a.weekKey.localeCompare(b.weekKey)
    );
  }, [grouped]);

  const totalsByEmployee = useMemo(() => {
    const t = {};
    for (const r of grouped) {
      const name = r.employee_name || r.employee_id;
      const hrs = h2(r._mins);
      const travelHrs = h2(r._travel);
      const ot = Math.max(hrs - 9, 0);
      if (!t[name]) t[name] = { hrs: 0, travel: 0, ot: 0, _days: new Set() };
      t[name].hrs += hrs;
      t[name].travel += travelHrs;
      t[name].ot += ot;
      // Arbeitstage zählen (Urlaub/Krank nicht als Arbeitstag)
      const note = (r.note || "").toString();
      const isAbs = note.includes("[Urlaub]") || note.includes("[Krank]");
      if (!isAbs && hrs > 0) t[name]._days.add(r.work_date);
    }
    // Sets -> Anzahl
    Object.values(t).forEach((v) => {
      v.days = v._days ? v._days.size : 0;
      delete v._days;
    });
    return t;
  }, [grouped]);

  const monthTotals = useMemo(() => {
    let workPlusTravel = 0;
    let travel = 0;
    for (const r of grouped) {
      workPlusTravel += r._mins;
      travel += r._travel;
    }
    return {
      totalHrs: h2(workPlusTravel),
      travelHrs: h2(travel),
    };
  }, [grouped]);

  // ----- Bearbeiten / Löschen -----
  function startEdit(row) {
    if (!isManager) return;
    const start = row.start_min ?? row.from_min ?? 0;
    const end = row.end_min ?? row.to_min ?? 0;
    setEditId(row.id);
    setEditState({
      id: row.id,
      employee_name: row.employee_name,
      project_id: row.project_id,
      from_hm: toHM(start),
      to_hm: toHM(end),
      break_min: row.break_min ?? 0,
      note: row.note ?? "",
      travel_minutes: getTravel(row) || 0,
    });
  }
  function cancelEdit() {
    setEditId(null);
    setEditState(null);
  }

  async function saveEdit() {
    if (!isManager || !editId || !editState) return;
    const from_m = hmToMin(editState.from_hm);
    const to_m = hmToMin(editState.to_hm);
    const br_m = parseInt(editState.break_min || "0", 10);
    const prj = projects.find((p) => p.id === editState.project_id) || null;

    const update = {
      project_id: prj ? prj.id : null,
      start_min: from_m,
      end_min: to_m,
      break_min: isNaN(br_m) ? 0 : br_m,
      note: (editState.note || "").trim() || null,
    };
    if (typeof editState.travel_minutes !== "undefined") {
      update.travel_minutes = parseInt(editState.travel_minutes || "0", 10);
    }

    const { error } = await supabase
      .from("time_entries")
      .update(update)
      .eq("id", editId);
    if (error) {
      console.error("update error:", error);
      alert("Aktualisieren fehlgeschlagen.");
      return;
    }
    await loadMonth();
    cancelEdit();
  }

  async function deleteEntry(id) {
    if (!isManager) return;
    if (!confirm("Eintrag wirklich löschen?")) return;
    const { error } = await supabase
      .from("time_entries")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("delete error:", error);
      alert("Löschen fehlgeschlagen.");
      return;
    }
    await loadMonth();
  }

  // ----- Export: CSV -----
  function exportCSV() {
    const headers = [
      "Datum",
      "Mitarbeiter",
      "Projekt",
      "Start",
      "Ende",
      "Pause (min)",
      "Fahrzeit (min)",
      "Stunden (inkl. Fahrzeit)",
      "Überstunden",
      "Notiz",
    ];
    const lines = [headers.join(";")];
    for (const r of grouped) {
      const start = r.start_min ?? r.from_min ?? 0;
      const end = r.end_min ?? r.to_min ?? 0;
      const hrs = h2(r._mins);
      const ot = Math.max(hrs - 9, 0);
      lines.push(
        [
          r.work_date,
          r.employee_name || "",
          r.project_name || "",
          toHM(start),
          toHM(end),
          r.break_min ?? 0,
          r._travel ?? 0,
          hrs.toFixed(2),
          ot.toFixed(2),
          (r.note || "").replace(/[\r\n;]/g, " "),
        ].join(";")
      );
    }
    lines.push(
      [
        "",
        "",
        "",
        "",
        "",
        "Fahrzeit gesamt (h)",
        monthTotals.travelHrs.toFixed(2),
        "Gesamt inkl. Fahrzeit (h)",
        monthTotals.totalHrs.toFixed(2),
        "",
      ].join(";")
    );

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Monatsübersicht_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ----- Export: PDF -----
  function exportPDF() {
    try {
      const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });
    const title = `Monatsübersicht ${month}`;
    doc.setFontSize(16);
    doc.text(title, 40, 40);

    const head = [
      [
        "Datum",
        "Mitarbeiter",
        "Projekt",
        "Start",
        "Ende",
        "Pause (min)",
        "Fahrzeit (min)",
        "Stunden (inkl. Fahrzeit)",
        "Überstunden",
        "Notiz",
      ],
    ];
    const body = grouped.map((r) => {
      const start = r.start_min ?? r.from_min ?? 0;
      const end = r.end_min ?? r.to_min ?? 0;
      const hrs = h2(r._mins);
      const ot = Math.max(hrs - 9, 0);
      return [
        r.work_date,
        r.employee_name || "",
        r.project_name || "",
        toHM(start),
        toHM(end),
        r.break_min ?? 0,
        r._travel ?? 0,
        hrs.toFixed(2),
        ot.toFixed(2),
        (r.note || "").replace(/\r?\n/g, " "),
      ];
    });

    autoTable(doc, {
      head,
      body,
      startY: 60,
      styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [123, 74, 45] },
      didDrawPage: () => {
        doc.setFontSize(9);
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.text(
          `Erstellt am ${new Date().toLocaleDateString("de-AT")}`,
          pageWidth - 40,
          30,
          { align: "right" }
        );
      },
      margin: { left: 40, right: 40 },
    });

    // Summen pro Mitarbeiter
    const sumHead = [
      [
        "Mitarbeiter",
        "Tage",
        "Stunden gesamt (inkl. Fahrzeit)",
        "Fahrzeit gesamt (h)",
        "Überstunden (Summe Tages-Ü>9h)",
      ],
    ];
    const sumBody = Object.entries(totalsByEmployee).map(([name, t]) => [
      name,
      t.days ?? 0,
      t.hrs.toFixed(2),
      t.travel.toFixed(2),
      t.ot.toFixed(2),
    ]);
    autoTable(doc, {
      head: sumHead,
      body: sumBody,
      startY: (doc.lastAutoTable?.finalY || 60) + 20,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [200, 200, 200] },
      margin: { left: 40, right: 40 },
    });

    // Monats-Gesamtblock
    const y0 = (doc.lastAutoTable?.finalY || 60) + 22;
    doc.setFontSize(12);
    doc.text(
      `Monatssummen – Fahrzeit: ${monthTotals.travelHrs.toFixed(
        2
      )} h | Gesamt inkl. Fahrzeit: ${monthTotals.totalHrs.toFixed(2)} h`,
      40,
      y0
    );

    // Wochenblöcke
    let y = y0 + 16;
    doc.setFontSize(14);
    doc.text("Wochenübersicht (ISO, Mo–So) – Wochen-Ü (BUAK) > Soll", 40, y);
    y += 10;

    weekly.forEach((wk, idx) => {
      const weekSoll = getBuakSollHoursForWeek(wk.firstDate || (wk.days?.[0]?.work_date));
      const weekType = getBuakWeekType(wk.firstDate || (wk.days?.[0]?.work_date));
      const weekTypeLabel = weekType === "kurz" ? "Kurze Woche" : weekType === "lang" ? "Lange Woche" : "";
      const tableHead = [
        [
          "Woche",
          "Mitarbeiter",
          "Datum",
          "Projekt",
          "Start",
          "Ende",
          "Pause (min)",
          "Fahrzeit (min)",
          "Stunden (inkl. Fahrzeit)",
          "Ü (>9h/Tag)",
        ],
      ];
      const tableBody = [];
      wk.days.forEach((r) => {
        const start = r.start_min ?? r.from_min ?? 0;
        const end = r.end_min ?? r.to_min ?? 0;
        const hrs = h2(r._mins);
        const ot = Math.max(hrs - 9, 0);
        tableBody.push([
          wk.weekKey,
          wk.employee,
          r.work_date,
          r.project_name || "",
          toHM(start),
          toHM(end),
          r.break_min ?? 0,
          r._travel ?? 0,
          hrs.toFixed(2),
          ot.toFixed(2),
        ]);
      });
      const weekHours = h2(wk._mins);
      const weekOT = Math.max(weekHours - weekSoll, 0);

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: y + 10,
        styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [235, 235, 235] },
        margin: { left: 40, right: 40 },
      });

      y = (doc.lastAutoTable?.finalY || 60) + 5;
      doc.setFontSize(10);
      doc.text(
        `Wochensumme ${wk.weekKey} – ${wk.employee}: ${weekHours.toFixed(
          2
        )} h  |  Wochen-Ü (>39h): ${weekOT.toFixed(2)} h`,
        40,
        y
      );
      y += 18;

      if (
        y > doc.internal.pageSize.getHeight() - 80 &&
        idx < weekly.length - 1
      ) {
        doc.addPage();
        y = 40;
      }
    });

      doc.save(`Monatsübersicht_${month}.pdf`);
    } catch (err) {
      console.error("PDF Export Fehler:", err);
      alert("PDF Export Fehler – bitte F12 Konsole öffnen.\n" + (err?.message || err));
    }
  }

  // ----- UI -----
  return (
    <div className="max-w-screen-xl mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-sm font-semibold">Monat</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded border"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold">Projekt</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 rounded border min-w-[220px]"
          >
            <option value="">Alle</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} · ${p.name}` : p.name}
              </option>
            ))}
          </select>
        </div>

        {isManager && (
          <div className="flex-1">
            <label className="block text-sm font-semibold">
              Mitarbeiter (Mehrfachauswahl)
            </label>

            {/* Steuerleiste wie bei Zeiterfassung */}
            <div className="mt-1 mb-1 flex items-center gap-2 text-xs">
              <button
                type="button"
                className="hbz-btn btn-small"
                onClick={() => setSelectedCodes(employees.map((e) => e.code))}
              >
                Alle
              </button>
              <button
                type="button"
                className="hbz-btn btn-small"
                onClick={() => setSelectedCodes([])}
              >
                Keine
              </button>
              <span className="opacity-70">
                {selectedEmployees.length} / {employees.length} gewählt
                {selectedEmployees.length > 0 && (
                  <>
                    {" "}
                    (
                    {selectedEmployees
                      .map((e) => e.name || e.code)
                      .join(", ")}
                    )
                  </>
                )}
              </span>
            </div>

            {/* Chips */}
            <div className="mt-1 flex flex-wrap gap-2">
              {employees.map((e) => {
                const active = selectedCodes.includes(e.code);
                return (
                  <button
                    key={e.id}
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
        )}

        <div className="ml-auto flex gap-2">
          <button onClick={exportPDF} className="px-3 py-2 rounded border">
            PDF export
          </button>
          <button onClick={exportCSV} className="px-3 py-2 rounded border">
            CSV export
          </button>
        </div>
      </div>

      <div className="hbz-card">
        <div
          className="px-2 py-2 font-semibold"
          style={{ background: "#f6eee4", borderRadius: 8 }}
        >
          {loading ? "Lade…" : `Einträge ${month}`}
        </div>

        <div className="mo-wrap">
          {grouped.length === 0 ? (
            <div className="text-sm opacity-70 p-3">Keine Einträge.</div>
          ) : (
            <div className="mo-responsive">
              {/* Desktop / Tablet: Tabelle */}
              {!isMobile && (
                <div className="mo-table-wrapper">
                  <table className="nice mo-table">
                    <thead>
                      <tr>
                        <th className="mo-col-date">Datum</th>
                        <th className="mo-col-emp">Mitarbeiter</th>
                        <th className="mo-col-prj">Projekt</th>
                        <th className="mo-col-time">Start</th>
                        <th className="mo-col-time">Ende</th>
                        <th className="mo-col-pause">Pause</th>
                        <th className="mo-col-pause">Fahrzeit</th>
                        <th className="mo-col-hrs">Stunden (inkl. Fahrzeit)</th>
                        <th className="mo-col-ot">Überstunden</th>
                        <th className="mo-col-note">Notiz</th>
                        <th className="mo-col-actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((r) => {
                        const start = r.start_min ?? r.from_min ?? 0;
                        const end = r.end_min ?? r.to_min ?? 0;
                        const hrs = h2(r._mins);
                        const ot = Math.max(hrs - 9, 0);
                        const isEditing = editId === r.id;

                        if (!isEditing) {
                          return (
                            <tr key={`${r.id}-${r.work_date}`}>
                              <td>{r.work_date}</td>
                              <td>{r.employee_name}</td>
                              <td>{r.project_name || "—"}</td>
                              <td style={{ textAlign: "center" }}>
                                {toHM(start)}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {toHM(end)}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {r.break_min ?? 0} min
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {r._travel ?? 0} min
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {hrs.toFixed(2)}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {ot.toFixed(2)}
                              </td>
                              <td>{r.note || ""}</td>
                              <td style={{ textAlign: "right" }}>
                                {isManager ? (
                                  <>
                                    <button
                                      className="hbz-btn btn-small"
                                      onClick={() => startEdit(r)}
                                    >
                                      Bearbeiten
                                    </button>
                                    <button
                                      className="hbz-btn btn-small"
                                      onClick={() => deleteEntry(r.id)}
                                    >
                                      Löschen
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-xs opacity-60">
                                    nur Anzeige
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        }

                        // Edit-Zeile in der Tabelle
                        return (
                          <tr key={`${r.id}-edit`}>
                            <td>{r.work_date}</td>
                            <td>{r.employee_name}</td>
                            <td>
                              <select
                                className="hbz-input"
                                value={editState.project_id ?? ""}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    project_id: e.target.value || null,
                                  }))
                                }
                              >
                                <option value="">— ohne Projekt —</option>
                                {projects.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.code
                                      ? `${p.code} · ${p.name}`
                                      : p.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="time"
                                className="hbz-input"
                                value={editState.from_hm}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    from_hm: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="time"
                                className="hbz-input"
                                value={editState.to_hm}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    to_hm: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <input
                                type="number"
                                min={0}
                                step={5}
                                className="hbz-input"
                                value={editState.break_min}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    break_min: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <input
                                type="number"
                                min={0}
                                step={15}
                                className="hbz-input"
                                value={editState.travel_minutes ?? 0}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    travel_minutes: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td colSpan={1} style={{ textAlign: "right" }}>
                              {(() => {
                                const minsLive =
                                  Math.max(
                                    hmToMin(editState.to_hm) -
                                      hmToMin(editState.from_hm) -
                                      (parseInt(
                                        editState.break_min || "0",
                                        10
                                      ) || 0),
                                    0
                                  ) +
                                  (parseInt(
                                    editState.travel_minutes || "0",
                                    10
                                  ) || 0);
                                const hrsLive = h2(minsLive);
                                const otLive = Math.max(hrsLive - 9, 0);
                                return `${hrsLive.toFixed(
                                  2
                                )} h / Ü: ${otLive.toFixed(2)} h`;
                              })()}
                            </td>
                            <td>
                              <input
                                type="text"
                                className="hbz-input"
                                value={editState.note}
                                onChange={(e) =>
                                  setEditState((s) => ({
                                    ...s,
                                    note: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="hbz-btn btn-small"
                                onClick={saveEdit}
                              >
                                Speichern
                              </button>
                              <button
                                className="hbz-btn btn-small"
                                onClick={cancelEdit}
                              >
                                Abbrechen
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Handy: Karten-Ansicht */}
              {isMobile && (
                <div className="mo-cards">
                  {grouped.map((r) => {
                    const start = r.start_min ?? r.from_min ?? 0;
                    const end = r.end_min ?? r.to_min ?? 0;
                    const hrs = h2(r._mins);
                    const ot = Math.max(hrs - 9, 0);
                    const isEditing = editId === r.id;

                    if (!isEditing) {
                      return (
                        <div
                          key={`card-${r.id}-${r.work_date}`}
                          className="mo-card"
                        >
                          <div className="mo-card-header">
                            <div className="mo-card-title">
                              <div className="mo-card-date">{r.work_date}</div>
                              <div className="mo-card-emp">
                                {r.employee_name}
                              </div>
                            </div>
                            <div className="mo-card-hours">
                              <div className="mo-card-mainhrs">
                                {hrs.toFixed(2)} h
                              </div>
                              <div className="mo-card-ot">
                                Ü: {ot.toFixed(2)} h
                              </div>
                            </div>
                          </div>

                          <div className="mo-card-row">
                            <strong>Projekt: </strong>
                            {r.project_name || "—"}
                          </div>

                          <div className="mo-card-row mo-card-meta">
                            <span>Start: {toHM(start)}</span>
                            <span>Ende: {toHM(end)}</span>
                            <span>Pause: {r.break_min ?? 0} min</span>
                            <span>Fahrzeit: {r._travel ?? 0} min</span>
                          </div>

                          {r.note && (
                            <div className="mo-card-row">
                              <strong>Notiz: </strong>
                              {r.note}
                            </div>
                          )}

                          <div className="mo-card-actions">
                            {isManager ? (
                              <>
                                <button
                                  className="hbz-btn btn-small"
                                  onClick={() => startEdit(r)}
                                >
                                  Bearbeiten
                                </button>
                                <button
                                  className="hbz-btn btn-small"
                                  onClick={() => deleteEntry(r.id)}
                                >
                                  Löschen
                                </button>
                              </>
                            ) : (
                              <span className="text-xs opacity-60">
                                nur Anzeige
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Edit-Karte auf Handy
                    const minsLive =
                      Math.max(
                        hmToMin(editState.to_hm) -
                          hmToMin(editState.from_hm) -
                          (parseInt(editState.break_min || "0", 10) || 0),
                        0
                      ) +
                      (parseInt(editState.travel_minutes || "0", 10) || 0);
                    const hrsLive = h2(minsLive);
                    const otLive = Math.max(hrsLive - 9, 0);

                    return (
                      <div
                        key={`card-${r.id}-edit`}
                        className="mo-card mo-card-edit"
                      >
                        <div className="mo-card-header">
                          <div className="mo-card-title">
                            <div className="mo-card-date">{r.work_date}</div>
                            <div className="mo-card-emp">
                              {r.employee_name}
                            </div>
                          </div>
                          <div className="mo-card-hours">
                            <div className="mo-card-mainhrs">
                              {hrsLive.toFixed(2)} h
                            </div>
                            <div className="mo-card-ot">
                              Ü: {otLive.toFixed(2)} h
                            </div>
                          </div>
                        </div>

                        <div className="mo-card-row">
                          <label className="mo-card-label">
                            Projekt
                            <select
                              className="hbz-input"
                              value={editState.project_id ?? ""}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  project_id: e.target.value || null,
                                }))
                              }
                            >
                              <option value="">— ohne Projekt —</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.code
                                    ? `${p.code} · ${p.name}`
                                    : p.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="mo-card-row mo-card-meta-edit">
                          <label className="mo-card-label">
                            Start
                            <input
                              type="time"
                              className="hbz-input"
                              value={editState.from_hm}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  from_hm: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="mo-card-label">
                            Ende
                            <input
                              type="time"
                              className="hbz-input"
                              value={editState.to_hm}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  to_hm: e.target.value,
                                }))
                              }
                            />
                          </label>
                        </div>

                        <div className="mo-card-row mo-card-meta-edit">
                          <label className="mo-card-label">
                            Pause (min)
                            <input
                              type="number"
                              min={0}
                              step={5}
                              className="hbz-input"
                              value={editState.break_min}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  break_min: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="mo-card-label">
                            Fahrzeit (min)
                            <input
                              type="number"
                              min={0}
                              step={15}
                              className="hbz-input"
                              value={editState.travel_minutes ?? 0}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  travel_minutes: e.target.value,
                                }))
                              }
                            />
                          </label>
                        </div>

                        <div className="mo-card-row">
                          <label className="mo-card-label">
                            Notiz
                            <input
                              type="text"
                              className="hbz-input"
                              value={editState.note}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  note: e.target.value,
                                }))
                              }
                            />
                          </label>
                        </div>

                        <div className="mo-card-footer">
                          <span className="mo-card-summary">
                            {hrsLive.toFixed(2)} h / Ü: {otLive.toFixed(2)} h
                          </span>
                          <div className="mo-card-actions">
                            <button
                              className="hbz-btn btn-small"
                              onClick={saveEdit}
                            >
                              Speichern
                            </button>
                            <button
                              className="hbz-btn btn-small"
                              onClick={cancelEdit}
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Monats-Summenleiste */}
        <div className="px-3 py-2 text-sm opacity-80">
          <b>Monatssummen:</b>&nbsp;
          Fahrzeit: {monthTotals.travelHrs.toFixed(2)} h &nbsp;|&nbsp; Gesamt
          inkl. Fahrzeit: {monthTotals.totalHrs.toFixed(2)} h
        </div>
      </div>
    </div>
  );
}
