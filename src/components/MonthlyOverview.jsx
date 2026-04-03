import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getISOWeek,
  getBuakWeekType,
  getBuakSollHoursForWeek,
  calcBuakSollHoursForMonth,
} from "../utils/time";

// ---------- Utils ----------
const toHM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(
    2,
    "0"
  )}`;

const hmToMin = (hm) => {
  if (!hm) return 0;
  const [h, m] = String(hm)
    .split(":")
    .map((x) => parseInt(x || "0", 10));
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

const isAbsenceRow = (r) => {
  const note = (r?.note || "").toString();
  return note.includes("[Urlaub]") || note.includes("[Krank]");
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

  // PDF Dialog
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [pdfOptions, setPdfOptions] = useState({
    selectedEmployeeCodes: [],
    includeDetails: true,
    includeWeekly: true,
    includeTotals: true,
    includeTravel: true,
    includeOvertime: true,
    includeAbsence: true,
    includeWorkdays: true,
    includeBuak: true,
  });

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

  // Abgeleitet: aktuell ausgewählte Mitarbeiter
  const selectedEmployees = useMemo(
    () => employees.filter((e) => selectedCodes.includes(e.code)),
    [employees, selectedCodes]
  );

  // Lookup für Export
  const employeesById = useMemo(() => {
    const map = {};
    employees.forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [employees]);

  // Default PDF Mitarbeiter = aktuell ausgewählte Mitarbeiter
  useEffect(() => {
    setPdfOptions((prev) => ({
      ...prev,
      selectedEmployeeCodes:
        selectedCodes.length > 0
          ? [...selectedCodes]
          : isStaff && session?.code
          ? [session.code]
          : [],
    }));
  }, [selectedCodes, isStaff, session?.code]);

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

          // Standard: nur sich selbst anzeigen
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

      // Projects
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
  }, [month, selectedCodes, selectedProjectId, isManager, employees.length]);

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

      if (isManager) {
        q = q.in("employee_id", ids);
      } else {
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

      if (!g[key]) {
        g[key] = {
          ...r,
          _mins: 0,
          _travel: 0,
          items: [],
        };
      }

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

      if (!w[key]) {
        w[key] = {
          employee: emp,
          weekKey: wk,
          firstDate: r.work_date,
          days: [],
          _mins: 0,
          _travel: 0,
        };
      }

      w[key].days.push(r);
      w[key]._mins += r._mins;
      w[key]._travel += r._travel;

      if (!w[key].firstDate || r.work_date < w[key].firstDate) {
        w[key].firstDate = r.work_date;
      }
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

      if (!isAbsenceRow(r) && hrs > 0) {
        t[name]._days.add(r.work_date);
      }
    }

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

    const { error } = await supabase.from("time_entries").delete().eq("id", id);

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

  function openPdfDialog() {
    setPdfOptions((prev) => ({
      ...prev,
      selectedEmployeeCodes:
        selectedCodes.length > 0
          ? [...selectedCodes]
          : isStaff && session?.code
          ? [session.code]
          : employees.map((e) => e.code),
    }));
    setShowPdfDialog(true);
  }

  // ----- Export: PDF -----
  function exportPDF() {
    try {
      const selectedPdfCodes =
        pdfOptions.selectedEmployeeCodes?.length > 0
          ? pdfOptions.selectedEmployeeCodes
          : selectedCodes;

      const exportGroupedBase = grouped.filter((r) => {
        const code = employeesById[r.employee_id]?.code;
        return selectedPdfCodes.includes(code);
      });

      const exportGrouped = pdfOptions.includeAbsence
        ? exportGroupedBase
        : exportGroupedBase.filter((r) => !isAbsenceRow(r));

      if (!exportGrouped.length) {
        alert("Keine Daten für den PDF Export ausgewählt.");
        return;
      }

      const exportWeekly = (() => {
        const w = {};
        for (const r of exportGrouped) {
          const wk = weekKey(r.work_date);
          const emp = r.employee_name || r.employee_id;
          const key = `${emp}||${wk}`;

          if (!w[key]) {
            w[key] = {
              employee: emp,
              weekKey: wk,
              firstDate: r.work_date,
              days: [],
              _mins: 0,
              _travel: 0,
            };
          }

          w[key].days.push(r);
          w[key]._mins += r._mins;
          w[key]._travel += r._travel;

          if (!w[key].firstDate || r.work_date < w[key].firstDate) {
            w[key].firstDate = r.work_date;
          }
        }

        return Object.values(w).sort(
          (a, b) =>
            a.employee.localeCompare(b.employee) ||
            a.weekKey.localeCompare(b.weekKey)
        );
      })();

      const exportTotalsByEmployee = (() => {
        const t = {};
        for (const r of exportGrouped) {
          const name = r.employee_name || r.employee_id;
          const hrs = h2(r._mins);
          const travelHrs = h2(r._travel);
          const ot = Math.max(hrs - 9, 0);

          if (!t[name]) t[name] = { hrs: 0, travel: 0, ot: 0, _days: new Set() };

          t[name].hrs += hrs;
          t[name].travel += travelHrs;
          t[name].ot += ot;

          if (!isAbsenceRow(r) && hrs > 0) {
            t[name]._days.add(r.work_date);
          }
        }

        Object.values(t).forEach((v) => {
          v.days = v._days ? v._days.size : 0;
          delete v._days;
        });

        return t;
      })();

      const exportMonthTotals = (() => {
        let workPlusTravel = 0;
        let travel = 0;

        for (const r of exportGrouped) {
          workPlusTravel += r._mins;
          travel += r._travel;
        }

        return {
          totalHrs: h2(workPlusTravel),
          travelHrs: h2(travel),
        };
      })();

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });

      const title = `Monatsübersicht ${month}`;
      doc.setFontSize(16);
      doc.text(title, 40, 40);

      const selectedEmployeeNames = employees
        .filter((e) => selectedPdfCodes.includes(e.code))
        .map((e) => e.name || e.code);

      doc.setFontSize(10);
      doc.text(
        `Mitarbeiter: ${
          selectedEmployeeNames.length ? selectedEmployeeNames.join(", ") : "—"
        }`,
        40,
        58
      );

      doc.text(
        `Inhalt: ${
          [
            pdfOptions.includeDetails ? "Tagesdetails" : null,
            pdfOptions.includeWeekly ? "Wochenübersicht" : null,
            pdfOptions.includeTotals ? "Summen" : null,
            pdfOptions.includeTravel ? "Fahrzeit" : null,
            pdfOptions.includeOvertime ? "Überstunden" : null,
            pdfOptions.includeAbsence ? "Abwesenheiten" : null,
            pdfOptions.includeWorkdays ? "Arbeitstage" : null,
            pdfOptions.includeBuak ? "BUAK/Soll" : null,
          ]
            .filter(Boolean)
            .join(", ") || "—"
        }`,
        40,
        74
      );

      let currentY = 90;

      if (pdfOptions.includeDetails) {
        const detailHead = [
          [
            "Datum",
            "Mitarbeiter",
            "Projekt",
            "Start",
            "Ende",
            "Pause (min)",
            ...(pdfOptions.includeTravel ? ["Fahrzeit (min)"] : []),
            "Stunden (inkl. Fahrzeit)",
            ...(pdfOptions.includeOvertime ? ["Überstunden"] : []),
            "Notiz",
          ],
        ];

        const detailBody = exportGrouped.map((r) => {
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
            ...(pdfOptions.includeTravel ? [r._travel ?? 0] : []),
            hrs.toFixed(2),
            ...(pdfOptions.includeOvertime ? [ot.toFixed(2)] : []),
            (r.note || "").replace(/\r?\n/g, " "),
          ];
        });

        autoTable(doc, {
          head: detailHead,
          body: detailBody,
          startY: currentY,
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

        currentY = (doc.lastAutoTable?.finalY || currentY) + 20;
      }

      if (pdfOptions.includeTotals) {
        const sumHead = [
          [
            "Mitarbeiter",
            ...(pdfOptions.includeWorkdays ? ["Tage"] : []),
            "Stunden gesamt (inkl. Fahrzeit)",
            ...(pdfOptions.includeTravel ? ["Fahrzeit gesamt (h)"] : []),
            ...(pdfOptions.includeOvertime
              ? ["Überstunden (Summe Tages-Ü>9h)"]
              : []),
          ],
        ];

        const sumBody = Object.entries(exportTotalsByEmployee).map(
          ([name, t]) => [
            name,
            ...(pdfOptions.includeWorkdays ? [t.days ?? 0] : []),
            t.hrs.toFixed(2),
            ...(pdfOptions.includeTravel ? [t.travel.toFixed(2)] : []),
            ...(pdfOptions.includeOvertime ? [t.ot.toFixed(2)] : []),
          ]
        );

        autoTable(doc, {
          head: sumHead,
          body: sumBody,
          startY: currentY,
          styles: { fontSize: 10, cellPadding: 4 },
          headStyles: { fillColor: [200, 200, 200] },
          margin: { left: 40, right: 40 },
        });

        currentY = (doc.lastAutoTable?.finalY || currentY) + 22;
      }

      if (pdfOptions.includeTotals || pdfOptions.includeBuak || pdfOptions.includeTravel) {
        if (currentY > doc.internal.pageSize.getHeight() - 80) {
          doc.addPage();
          currentY = 40;
        }

        doc.setFontSize(12);

        const monthSollPerEmployee = calcBuakSollHoursForMonth(month);
        const employeeCountForSoll = Object.keys(exportTotalsByEmployee || {}).length;
        const monthSollTotal = monthSollPerEmployee * employeeCountForSoll;
        const monthAbw = exportMonthTotals.totalHrs - monthSollTotal;

        const summaryParts = [];

        if (pdfOptions.includeBuak) {
          summaryParts.push(`Soll (BUAK): ${monthSollTotal.toFixed(2)} h`);
        }

        summaryParts.push(`Ist: ${exportMonthTotals.totalHrs.toFixed(2)} h`);

        if (pdfOptions.includeBuak) {
          summaryParts.push(`Abw.: ${monthAbw.toFixed(2)} h`);
        }

        if (pdfOptions.includeTravel) {
          summaryParts.push(
            `Fahrzeit: ${exportMonthTotals.travelHrs.toFixed(2)} h`
          );
        }

        doc.text(`Monatssummen – ${summaryParts.join(" | ")}`, 40, currentY);
        currentY += 18;
      }

      if (pdfOptions.includeWeekly && exportWeekly.length > 0) {
        if (currentY > doc.internal.pageSize.getHeight() - 120) {
          doc.addPage();
          currentY = 40;
        }

        doc.setFontSize(14);
        doc.text("Wochenübersicht (ISO, Mo–So)", 40, currentY);
        currentY += 10;

        exportWeekly.forEach((wk, idx) => {
          const weekSoll = getBuakSollHoursForWeek(
            wk.firstDate || wk.days?.[0]?.work_date
          );
          const weekType = getBuakWeekType(
            wk.firstDate || wk.days?.[0]?.work_date
          );

          const weekTypeLabel =
            weekType === "kurz"
              ? "Kurze Woche"
              : weekType === "lang"
              ? "Lange Woche"
              : "";

          const weekHead = [
            [
              "Woche",
              "Mitarbeiter",
              "Datum",
              "Projekt",
              "Start",
              "Ende",
              "Pause (min)",
              ...(pdfOptions.includeTravel ? ["Fahrzeit (min)"] : []),
              "Stunden (inkl. Fahrzeit)",
              ...(pdfOptions.includeOvertime ? ["Ü (>9h/Tag)"] : []),
            ],
          ];

          const weekBody = [];
          wk.days.forEach((r) => {
            const start = r.start_min ?? r.from_min ?? 0;
            const end = r.end_min ?? r.to_min ?? 0;
            const hrs = h2(r._mins);
            const ot = Math.max(hrs - 9, 0);

            weekBody.push([
              wk.weekKey,
              wk.employee,
              r.work_date,
              r.project_name || "",
              toHM(start),
              toHM(end),
              r.break_min ?? 0,
              ...(pdfOptions.includeTravel ? [r._travel ?? 0] : []),
              hrs.toFixed(2),
              ...(pdfOptions.includeOvertime ? [ot.toFixed(2)] : []),
            ]);
          });

          const weekHours = h2(wk._mins);
          const weekOT = Math.max(weekHours - weekSoll, 0);

          autoTable(doc, {
            head: weekHead,
            body: weekBody,
            startY: currentY + 10,
            styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
            headStyles: { fillColor: [235, 235, 235] },
            margin: { left: 40, right: 40 },
          });

          currentY = (doc.lastAutoTable?.finalY || currentY) + 5;
          doc.setFontSize(10);

          const weekInfoParts = [];

          if (pdfOptions.includeBuak) {
            weekInfoParts.push(
              `${weekTypeLabel}${weekTypeLabel ? ", " : ""}Soll ${weekSoll.toFixed(
                2
              )} h`
            );
          }

          weekInfoParts.push(`${weekHours.toFixed(2)} h`);

          if (pdfOptions.includeBuak) {
            weekInfoParts.push(`Wochen-Ü (>Soll): ${weekOT.toFixed(2)} h`);
          }

          doc.text(
            `Wochensumme ${wk.weekKey} – ${wk.employee}: ${weekInfoParts.join(
              " | "
            )}`,
            40,
            currentY
          );

          currentY += 18;

          if (
            currentY > doc.internal.pageSize.getHeight() - 80 &&
            idx < exportWeekly.length - 1
          ) {
            doc.addPage();
            currentY = 40;
          }
        });
      }

      doc.save(`Monatsübersicht_${month}.pdf`);
    } catch (err) {
      console.error("PDF Export Fehler:", err);
      alert(
        "PDF Export Fehler – bitte F12 Konsole öffnen.\n" +
          (err?.message || err)
      );
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
                    {selectedEmployees.map((e) => e.name || e.code).join(", ")}
                    )
                  </>
                )}
              </span>
            </div>

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
          <button onClick={openPdfDialog} className="px-3 py-2 rounded border">
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
                                    {p.code ? `${p.code} · ${p.name}` : p.name}
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
                                      (parseInt(editState.break_min || "0", 10) ||
                                        0),
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
                                  {p.code ? `${p.code} · ${p.name}` : p.name}
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

        <div className="px-3 py-2 text-sm opacity-80">
          <b>Monatssummen:</b>&nbsp;
          Fahrzeit: {monthTotals.travelHrs.toFixed(2)} h &nbsp;|&nbsp; Gesamt
          inkl. Fahrzeit: {monthTotals.totalHrs.toFixed(2)} h
        </div>
      </div>

      {showPdfDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-4 w-full max-w-3xl mx-3"
            style={{ maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">PDF Export auswählen</h3>
              <button
                className="px-3 py-1 rounded border"
                onClick={() => setShowPdfDialog(false)}
              >
                Schließen
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="border rounded-lg p-3">
                <div className="font-semibold mb-2">Mitarbeiter</div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    className="hbz-btn btn-small"
                    onClick={() =>
                      setPdfOptions((prev) => ({
                        ...prev,
                        selectedEmployeeCodes: employees.map((e) => e.code),
                      }))
                    }
                  >
                    Alle
                  </button>

                  <button
                    type="button"
                    className="hbz-btn btn-small"
                    onClick={() =>
                      setPdfOptions((prev) => ({
                        ...prev,
                        selectedEmployeeCodes: session?.code
                          ? [session.code]
                          : [],
                      }))
                    }
                  >
                    Nur mich
                  </button>

                  <button
                    type="button"
                    className="hbz-btn btn-small"
                    onClick={() =>
                      setPdfOptions((prev) => ({
                        ...prev,
                        selectedEmployeeCodes: [...selectedCodes],
                      }))
                    }
                  >
                    Aktuelle Auswahl
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {employees.map((e) => {
                    const checked = pdfOptions.selectedEmployeeCodes.includes(
                      e.code
                    );
                    return (
                      <label
                        key={`pdf-emp-${e.id}`}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(ev) => {
                            const isChecked = ev.target.checked;
                            setPdfOptions((prev) => ({
                              ...prev,
                              selectedEmployeeCodes: isChecked
                                ? [...prev.selectedEmployeeCodes, e.code]
                                : prev.selectedEmployeeCodes.filter(
                                    (c) => c !== e.code
                                  ),
                            }));
                          }}
                        />
                        <span>{e.name || e.code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <div className="font-semibold mb-2">Inhalt</div>

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeDetails}
                      onChange={(e) =>
                        setPdfOptions((prev) => ({
                          ...prev,
                          includeDetails: e.target.checked,
                        }))
                      }
                    />
                    <span>Tagesdetails</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeWeekly}
                      onChange={(e) =>
                        setPdfOptions((prev) => ({
                          ...prev,
                          includeWeekly: e.target.checked,
                        }))
                      }
                    />
                    <span>Wochenübersicht</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeTotals}
                      onChange={(e) =>
                        setPdfOptions((prev) => ({
                          ...prev,
                          includeTotals: e.target.checked,
                        }))
                      }
                    />
                    <span>Summen</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeTravel}
                      onChange={(e) =>
                        setPdfOptions((prev) => ({
                          ...prev,
                          includeTravel: e.target.checked,
                        }))
                      }
                    />
                    <span>Fahrzeit</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeOvertime}
                      onChange={(e) =>
                        setPdfOptions((prev) => ({
                          ...prev,
                          includeOvertime: e.target.checked,
                        }))
                      }
                    />
                    <span>Überstunden</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeAbsence}
                      onChange={(e) =>
                        setPdfOptions((prev) => ({
                          ...prev,
                          includeAbsence: e.target.checked,
                        }))
                      }
                    />
                    <span>Krank / Urlaub anzeigen</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeWorkdays}
                      onChange={(e) =>
                        setPdfOptions((prev) => ({
                          ...prev,
                          includeWorkdays: e.target.checked,
                        }))
                      }
                    />
                    <span>Arbeitstage</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeBuak}
                      onChange={(e) =>
                        setPdfOptions((prev) => ({
                          ...prev,
                          includeBuak: e.target.checked,
                        }))
                      }
                    />
                    <span>BUAK / Sollstunden / kurze-lange Woche</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                className="px-3 py-2 rounded border"
                onClick={() => setShowPdfDialog(false)}
              >
                Abbrechen
              </button>
              <button
                className="px-3 py-2 rounded border text-white"
                style={{ background: "#7b4a2d" }}
                onClick={() => {
                  exportPDF();
                  setShowPdfDialog(false);
                }}
              >
                PDF exportieren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}