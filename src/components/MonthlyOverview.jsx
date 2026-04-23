import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
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

const getTravel = (e) => e.travel_minutes ?? e.travel_min ?? 0;

const entryMinutes = (e) => {
  const start = e.start_min ?? e.from_min ?? 0;
  const end = e.end_min ?? e.to_min ?? 0;
  const pause = e.break_min || 0;
  const work = Math.max(end - start - pause, 0);
  const travel = getTravel(e);
  return work + (travel || 0);
};

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

function getMonthRange(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
  const lastDay = new Date(y, m, 0).getDate();
  return {
    year: y,
    month: m,
    from: `${y}-${ym.slice(5)}-01`,
    to: `${y}-${ym.slice(5)}-${String(lastDay).padStart(2, "0")}`,
  };
}

function compareMonthStrings(a, b) {
  if (!a || !b) return 0;
  return a.localeCompare(b);
}

function getMonthListBetween(fromYm, toYm) {
  if (!fromYm || !toYm) return [];

  const [fromY, fromM] = fromYm.split("-").map(Number);
  const [toY, toM] = toYm.split("-").map(Number);

  const out = [];
  let y = fromY;
  let m = fromM;

  while (y < toY || (y === toY && m <= toM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return out;
}

function getRangeFromFilters(year, monthFilter, rangeFromMonth, rangeToMonth) {
  const fromRange = getMonthRange(rangeFromMonth);
  const toRange = getMonthRange(rangeToMonth);
  const singleMonth = getMonthRange(monthFilter);

  if (fromRange && toRange) {
    const isNormalOrder = compareMonthStrings(rangeFromMonth, rangeToMonth) <= 0;
    const useFrom = isNormalOrder ? fromRange : toRange;
    const useTo = isNormalOrder ? toRange : fromRange;
    const fromYm = isNormalOrder ? rangeFromMonth : rangeToMonth;
    const toYm = isNormalOrder ? rangeToMonth : rangeFromMonth;

    return {
      mode: "range",
      from: useFrom.from,
      to: useTo.to,
      label: `${fromYm} bis ${toYm}`,
      yearForBuak: null,
      monthList: getMonthListBetween(fromYm, toYm),
    };
  }

  if (singleMonth) {
    return {
      mode: "month",
      from: singleMonth.from,
      to: singleMonth.to,
      label: `Monat ${monthFilter}`,
      yearForBuak: singleMonth.year,
      monthList: [monthFilter],
    };
  }

  return {
    mode: "year",
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    label: `Jahr ${year}`,
    yearForBuak: year,
    monthList: Array.from(
      { length: 12 },
      (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`
    ),
  };
}

const isAbsenceRow = (r) => {
  const note = (r?.note || "").toString();
  return note.includes("[Urlaub]") || note.includes("[Krank]");
};

const isVacationRow = (r) => (r?.note || "").toString().includes("[Urlaub]");
const isSickRow = (r) => (r?.note || "").toString().includes("[Krank]");

const getPureWorkMinutes = (r) => {
  const total = r?._mins ?? entryMinutes(r);
  const travel = r?._travel ?? getTravel(r);
  return Math.max(total - travel, 0);
};

// ---------- Component ----------
export default function MonthlyOverview() {
  const session = getSession()?.user || null;
  const role = (session?.role || "mitarbeiter").toLowerCase();
  const isStaff = role === "mitarbeiter";
  const isManager = !isStaff;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const [year, setYear] = useState(currentYear);
  const [monthFilter, setMonthFilter] = useState(currentMonthStr);
  const [rangeFromMonth, setRangeFromMonth] = useState("");
  const [rangeToMonth, setRangeToMonth] = useState("");

  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState(
    isStaff ? [session?.code].filter(Boolean) : []
  );
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editState, setEditState] = useState(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const selectedEmployees = useMemo(
    () => employees.filter((e) => selectedCodes.includes(e.code)),
    [employees, selectedCodes]
  );

  const employeesById = useMemo(() => {
    const map = {};
    employees.forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [employees]);

  useEffect(() => {
    (async () => {
      if (isManager) {
        const { data, error } = await supabase
          .from("employees")
          .select("id, code, name, role, active, disabled")
          .eq("active", true)
          .eq("disabled", false)
          .order("name", { ascending: true });

        if (!error) {
          setEmployees(data || []);
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

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthFilter, rangeFromMonth, rangeToMonth, selectedCodes, selectedProjectId, isManager, employees.length]);

  async function loadMonth() {
    try {
      setLoading(true);

      const range = getRangeFromFilters(
        year,
        monthFilter,
        rangeFromMonth,
        rangeToMonth
      );
      const from = range.from;
      const to = range.to;

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

  const activeRange = useMemo(
    () => getRangeFromFilters(year, monthFilter, rangeFromMonth, rangeToMonth),
    [year, monthFilter, rangeFromMonth, rangeToMonth]
  );

  const rangeLabel = useMemo(() => activeRange.label, [activeRange]);

  function handleCurrentMonth() {
    setYear(currentYear);
    setRangeFromMonth("");
    setRangeToMonth("");
    setMonthFilter(currentMonthStr);
  }

  function handleLast3Months() {
    const end = currentMonthStr;
    const d = new Date(currentYear, currentMonth - 1, 1);
    d.setMonth(d.getMonth() - 2);
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setYear(d.getFullYear());
    setMonthFilter("");
    setRangeFromMonth(start);
    setRangeToMonth(end);
  }

  function handleCurrentYear() {
    setYear(currentYear);
    setMonthFilter("");
    setRangeFromMonth("");
    setRangeToMonth("");
  }

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
    a.download = `Auswertung_${rangeLabel.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportLohnverrechnungPDF() {
    try {
      if (!grouped.length) {
        alert("Keine Daten für den Export vorhanden.");
        return;
      }

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(16);
      doc.text(`Lohnverrechnung ${rangeLabel}`, 40, 40);
      doc.setFontSize(10);
      doc.text(
        `Mitarbeiter: ${
          selectedEmployees.length
            ? selectedEmployees.map((e) => e.name || e.code).join(", ")
            : employees.map((e) => e.name || e.code).join(", ")
        }`,
        40,
        58
      );

      const employeeNames = Object.keys(totalsByEmployee).sort((a, b) => a.localeCompare(b));
      const body = employeeNames.map((name) => {
        const t = totalsByEmployee[name] || { hrs: 0, days: 0 };

        const urlaubDates = grouped
          .filter((r) => (r.employee_name || r.employee_id) === name && isVacationRow(r))
          .map((r) => r.work_date)
          .filter(Boolean)
          .sort();

        const krankDates = grouped
          .filter((r) => (r.employee_name || r.employee_id) === name && isSickRow(r))
          .map((r) => r.work_date)
          .filter(Boolean)
          .sort();

        return [
          name,
          t.hrs.toFixed(2),
          String(t.days ?? 0),
          urlaubDates.length ? urlaubDates.join(", ") : "-",
          krankDates.length ? krankDates.join(", ") : "-",
        ];
      });

      autoTable(doc, {
        head: [["Mitarbeiter", "Gesamtstunden", "Arbeitstage", "Urlaub (Datum)", "Krankenstand (Datum)"]],
        body,
        startY: 80,
        styles: { fontSize: 10, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [123, 74, 45] },
        margin: { left: 40, right: 40 },
      });

      doc.save(`Lohnverrechnung_${rangeLabel.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("Lohnverrechnung PDF Fehler:", err);
      alert("Lohnverrechnung PDF Fehler – bitte Konsole prüfen.");
    }
  }

  function exportAbrechnungPDF() {
    try {
      if (!grouped.length) {
        alert("Keine Daten für den Export vorhanden.");
        return;
      }

      const rowsForExport = grouped.filter((r) => !isAbsenceRow(r));
      if (!rowsForExport.length) {
        alert("Keine Arbeitsdaten für die Abrechnung vorhanden.");
        return;
      }

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(16);
      doc.text(`Abrechnung ${rangeLabel}`, 40, 40);
      doc.setFontSize(10);
      doc.text("Zuerst Projekt-Gesamtsummen, danach tägliche Auflistung je Mitarbeiter mit Arbeitszeit, Fahrzeit und Gesamtstunden", 40, 58);

      const perProject = {};
      rowsForExport.forEach((r) => {
        const key = r.project_name || "Ohne Projekt";
        if (!perProject[key]) {
          perProject[key] = {
            work: 0,
            travel: 0,
            total: 0,
            days: new Set(),
          };
        }

        const travel = r._travel || 0;
        const total = r._mins || 0;
        const work = getPureWorkMinutes(r);

        perProject[key].travel += travel;
        perProject[key].total += total;
        perProject[key].work += work;
        if (total > 0) perProject[key].days.add(r.work_date);
      });

      const projectBody = Object.entries(perProject)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([project, vals]) => [
          project,
          h2(vals.work).toFixed(2),
          h2(vals.travel).toFixed(2),
          h2(vals.total).toFixed(2),
          String(vals.days.size),
        ]);

      autoTable(doc, {
        head: [["Projekt", "Arbeitszeit", "Fahrzeit", "Gesamtstunden", "Arbeitstage"]],
        body: projectBody,
        startY: 80,
        styles: { fontSize: 10, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [123, 74, 45] },
        margin: { left: 40, right: 40 },
      });

      const body = rowsForExport.map((r) => {
        const totalHours = h2(r._mins);
        const travelHours = h2(r._travel);
        const pureWorkHours = h2(getPureWorkMinutes(r));

        return [
          r.work_date,
          r.employee_name || "",
          r.project_name || "—",
          pureWorkHours.toFixed(2),
          travelHours.toFixed(2),
          totalHours.toFixed(2),
        ];
      });

      autoTable(doc, {
        head: [["Datum", "Mitarbeiter", "Projekt", "Arbeitszeit", "Fahrzeit", "Gesamtstunden"]],
        body,
        startY: (doc.lastAutoTable?.finalY || 100) + 18,
        styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [200, 200, 200] },
        margin: { left: 40, right: 40 },
      });

      doc.save(`Abrechnung_${rangeLabel.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("Abrechnung PDF Fehler:", err);
      alert("Abrechnung PDF Fehler – bitte Konsole prüfen.");
    }
  }

  function exportNachkalkulationPDF() {
    try {
      if (!grouped.length) {
        alert("Keine Daten für den Export vorhanden.");
        return;
      }

      const rowsForExport = grouped.filter((r) => !isAbsenceRow(r));
      const totalTravelMinutes = rowsForExport.reduce((sum, r) => sum + (r._travel || 0), 0);
      const totalAllMinutes = rowsForExport.reduce((sum, r) => sum + (r._mins || 0), 0);
      const totalWorkMinutes = Math.max(totalAllMinutes - totalTravelMinutes, 0);

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      doc.setFontSize(16);
      doc.text(`Nachkalkulation ${rangeLabel}`, 40, 40);
      doc.setFontSize(10);
      doc.text("Gesamtstunden und Fahrzeit getrennt", 40, 58);

      autoTable(doc, {
        head: [["Auswertung", "Stunden"]],
        body: [
          ["Gesamtstunden Arbeit", h2(totalWorkMinutes).toFixed(2)],
          ["Fahrzeit", h2(totalTravelMinutes).toFixed(2)],
          ["Gesamtstunden inkl. Fahrzeit", h2(totalAllMinutes).toFixed(2)],
        ],
        startY: 80,
        styles: { fontSize: 11, cellPadding: 5 },
        headStyles: { fillColor: [123, 74, 45] },
        margin: { left: 40, right: 40 },
      });

      const perProject = {};
      rowsForExport.forEach((r) => {
        const key = r.project_name || "Ohne Projekt";
        if (!perProject[key]) perProject[key] = { work: 0, travel: 0, total: 0 };
        perProject[key].travel += r._travel || 0;
        perProject[key].total += r._mins || 0;
        perProject[key].work += getPureWorkMinutes(r);
      });

      const projectBody = Object.entries(perProject)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([project, vals]) => [
          project,
          h2(vals.work).toFixed(2),
          h2(vals.travel).toFixed(2),
          h2(vals.total).toFixed(2),
        ]);

      if (projectBody.length) {
        autoTable(doc, {
          head: [["Projekt", "Arbeitszeit", "Fahrzeit", "Gesamt"]],
          body: projectBody,
          startY: (doc.lastAutoTable?.finalY || 100) + 18,
          styles: { fontSize: 10, cellPadding: 4, overflow: "linebreak" },
          headStyles: { fillColor: [200, 200, 200] },
          margin: { left: 40, right: 40 },
        });
      }

      doc.save(`Nachkalkulation_${rangeLabel.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("Nachkalkulation PDF Fehler:", err);
      alert("Nachkalkulation PDF Fehler – bitte Konsole prüfen.");
    }
  }

  const summaryCards = [
    {
      label: "Fahrzeit",
      value: `${monthTotals.travelHrs.toFixed(2)} h`,
    },
    {
      label: "Gesamtstunden",
      value: `${monthTotals.totalHrs.toFixed(2)} h`,
    },
    {
      label: "Mitarbeiter",
      value: `${Object.keys(totalsByEmployee).length}`,
    },
    {
      label: "Einträge",
      value: `${grouped.length}`,
    },
  ];

  return (
    <div className="month-overview">
      <div className="month-overview-hero hbz-card">
        <div className="month-overview-hero__content">
          <div>
            <div className="month-overview-kicker">Auswertung</div>
            <h2 className="month-overview-title">Monatsübersicht</h2>
            <div className="month-overview-subtitle">
              Zeitraum: <b>{rangeLabel}</b>
            </div>
          </div>

          <div className="month-overview-actions">
            <button onClick={exportLohnverrechnungPDF} className="hbz-btn hbz-btn-primary">
              Lohnverrechnung
            </button>
            <button onClick={exportAbrechnungPDF} className="hbz-btn">
              Abrechnung
            </button>
            <button onClick={exportNachkalkulationPDF} className="hbz-btn">
              Nachkalkulation
            </button>
            <button onClick={exportCSV} className="hbz-btn">
              CSV export
            </button>
          </div>
        </div>
      </div>

      <div className="month-overview-topgrid">
        <div className="hbz-card month-filter-card">
          <div className="month-card-title">Filter</div>

          <div className="month-chip-actions">
            <button type="button" className="hbz-btn btn-small" onClick={handleCurrentMonth}>
              Aktueller Monat
            </button>
            <button type="button" className="hbz-btn btn-small" onClick={handleLast3Months}>
              Letzte 3 Monate
            </button>
            <button type="button" className="hbz-btn btn-small" onClick={handleCurrentYear}>
              Aktuelles Jahr
            </button>
          </div>

          <div className="year-range-grid">
            <div className="field-inline">
              <label className="hbz-label">Jahr</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="hbz-select"
              >
                {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="field-inline">
              <label className="hbz-label">Monat</label>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  setRangeFromMonth("");
                  setRangeToMonth("");
                  setMonthFilter(v);
                  const mr = getMonthRange(v);
                  if (mr) setYear(mr.year);
                }}
                className="hbz-input"
              />
            </div>

            <div className="field-inline">
              <label className="hbz-label">Von</label>
              <input
                type="month"
                value={rangeFromMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  setMonthFilter("");
                  setRangeFromMonth(v);
                  const mr = getMonthRange(v);
                  if (mr) setYear(mr.year);
                }}
                className="hbz-input"
              />
            </div>

            <div className="field-inline">
              <label className="hbz-label">Bis</label>
              <input
                type="month"
                value={rangeToMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  setMonthFilter("");
                  setRangeToMonth(v);
                }}
                className="hbz-input"
              />
            </div>

            <div className="field-inline">
              <label className="hbz-label">Projekt</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="hbz-select"
              >
                <option value="">Alle</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} · ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="year-range-active">
            Aktuell ausgewählt: <b>{rangeLabel}</b>
          </div>

          {isManager && (
            <div className="month-employee-block">
              <div className="month-employee-head">
                <label className="hbz-label">Mitarbeiter</label>
                <span className="badge-soft">
                  {selectedEmployees.length} / {employees.length} gewählt
                </span>
              </div>

              <div className="month-chip-actions">
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
              </div>

              <div className="month-chip-list">
                {employees.map((e) => {
                  const active = selectedCodes.includes(e.code);
                  return (
                    <button
                      key={e.id}
                      className={`month-chip ${active ? "active" : ""}`}
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
        </div>

        <div className="month-summary-grid">
          {summaryCards.map((card) => (
            <div key={card.label} className="month-summary-card">
              <div className="month-summary-label">{card.label}</div>
              <div className="month-summary-value">{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="hbz-card month-main-card">
        <div className="month-main-header">
          <div>
            <div className="month-card-title">Einträge</div>
            <div className="month-main-subtitle">
              {loading ? "Lade…" : `Einträge für ${rangeLabel}`}
            </div>
          </div>
        </div>

        <div className="mo-wrap">
          {grouped.length === 0 ? (
            <div className="month-empty-state">Keine Einträge.</div>
          ) : (
            <div className="mo-responsive">
              {!isMobile && (
                <div className="month-table-wrap">
                  <table className="month-table">
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Mitarbeiter</th>
                        <th>Projekt</th>
                        <th className="num">Start</th>
                        <th className="num">Ende</th>
                        <th className="num">Pause</th>
                        <th className="num">Fahrzeit</th>
                        <th className="num">Stunden</th>
                        <th className="num">Überstunden</th>
                        <th>Notiz</th>
                        <th className="num">Aktion</th>
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
                              <td className="num">{toHM(start)}</td>
                              <td className="num">{toHM(end)}</td>
                              <td className="num">{r.break_min ?? 0} min</td>
                              <td className="num">{r._travel ?? 0} min</td>
                              <td className="num">{hrs.toFixed(2)}</td>
                              <td className="num">{ot.toFixed(2)}</td>
                              <td>{r.note || ""}</td>
                              <td className="num">
                                {isManager ? (
                                  <div className="month-action-group">
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
                                  </div>
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
                            <td className="num">
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
                            <td className="num">
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
                            <td className="num">
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
                            <td className="num">
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
                            <td className="num">
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
                                return hrsLive.toFixed(2);
                              })()}
                            </td>
                            <td className="num">
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
                                return otLive.toFixed(2);
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
                            <td className="num">
                              <div className="month-action-group">
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
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {isMobile && (
                <div className="month-cards">
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
                          className="month-card"
                        >
                          <div className="month-card-header">
                            <div>
                              <div className="month-card-date">{r.work_date}</div>
                              <div className="month-card-emp">{r.employee_name}</div>
                            </div>
                            <div className="month-card-hours">
                              <div className="month-card-mainhrs">
                                {hrs.toFixed(2)} h
                              </div>
                              <div className="month-card-ot">
                                Ü: {ot.toFixed(2)} h
                              </div>
                            </div>
                          </div>

                          <div className="month-card-row">
                            <strong>Projekt:</strong> {r.project_name || "—"}
                          </div>

                          <div className="month-card-meta">
                            <span>Start: {toHM(start)}</span>
                            <span>Ende: {toHM(end)}</span>
                            <span>Pause: {r.break_min ?? 0} min</span>
                            <span>Fahrzeit: {r._travel ?? 0} min</span>
                          </div>

                          {r.note && (
                            <div className="month-card-row">
                              <strong>Notiz:</strong> {r.note}
                            </div>
                          )}

                          <div className="month-card-actions">
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
                        className="month-card month-card-edit"
                      >
                        <div className="month-card-header">
                          <div>
                            <div className="month-card-date">{r.work_date}</div>
                            <div className="month-card-emp">{r.employee_name}</div>
                          </div>
                          <div className="month-card-hours">
                            <div className="month-card-mainhrs">
                              {hrsLive.toFixed(2)} h
                            </div>
                            <div className="month-card-ot">
                              Ü: {otLive.toFixed(2)} h
                            </div>
                          </div>
                        </div>

                        <div className="month-card-field">
                          <label className="hbz-label">Projekt</label>
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
                        </div>

                        <div className="month-card-edit-grid">
                          <div className="month-card-field">
                            <label className="hbz-label">Start</label>
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
                          </div>
                          <div className="month-card-field">
                            <label className="hbz-label">Ende</label>
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
                          </div>
                        </div>

                        <div className="month-card-edit-grid">
                          <div className="month-card-field">
                            <label className="hbz-label">Pause (min)</label>
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
                          </div>
                          <div className="month-card-field">
                            <label className="hbz-label">Fahrzeit (min)</label>
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
                          </div>
                        </div>

                        <div className="month-card-field">
                          <label className="hbz-label">Notiz</label>
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
                        </div>

                        <div className="month-card-footer">
                          <span className="month-card-summary">
                            {hrsLive.toFixed(2)} h / Ü: {otLive.toFixed(2)} h
                          </span>
                          <div className="month-card-actions">
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
      </div>
    </div>
  );
}
