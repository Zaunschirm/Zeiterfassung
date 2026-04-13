import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  calcBuakSollHoursForYear,
  calcBuakSollHoursForMonth,
} from "../utils/time";

// ---- Helpers ----
const h2 = (m) => Math.round((m / 60) * 100) / 100;

function splitMinutes(r) {
  let work = r.work_minutes;
  let travel = r.travel_minutes ?? r.travel_min ?? r.travel ?? 0;

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

function calcBuakSollForMonthList(monthList) {
  return (monthList || []).reduce(
    (sum, ym) => sum + (calcBuakSollHoursForMonth(ym) || 0),
    0
  );
}

function uniq(arr) {
  return Array.from(new Set(arr));
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
  const [monthFilter, setMonthFilter] = useState("");
  const [rangeFromMonth, setRangeFromMonth] = useState("");
  const [rangeToMonth, setRangeToMonth] = useState("");

  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [pdfOptions, setPdfOptions] = useState({
    selectedEmployeeCodes: [],
    includeProjects: true,
    includeEmployees: true,
    includeEmployeeProjects: true,
    includeWorkHours: true,
    includeTotalHours: true,
    includeTravel: true,
    includeDays: true,
    includeBuak: true,
  });

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

  useEffect(() => {
    setPdfOptions((prev) => ({
      ...prev,
      selectedEmployeeCodes: [...selectedCodes],
    }));
  }, [selectedCodes]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    year,
    monthFilter,
    rangeFromMonth,
    rangeToMonth,
    selectedCodes,
    selectedProjectId,
    employees.length,
  ]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const range = getRangeFromFilters(
        year,
        monthFilter,
        rangeFromMonth,
        rangeToMonth
      );

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
        .gte("work_date", range.from)
        .lte("work_date", range.to)
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

  const activeRange = useMemo(
    () => getRangeFromFilters(year, monthFilter, rangeFromMonth, rangeToMonth),
    [year, monthFilter, rangeFromMonth, rangeToMonth]
  );

  const rangeLabel = useMemo(() => activeRange.label, [activeRange]);

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
          _days: new Set(),
        };

      e.work += work;
      e.travel += travel;
      e.total += total;
      e.cnt += 1;
      if (r.work_date) e._days.add(r.work_date);

      map.set(key, e);
    }

    return Array.from(map.values())
      .map((e) => ({
        ...e,
        days: e._days ? e._days.size : 0,
      }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [rows]);

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
          _days: new Set(),
        };

      e.work += work;
      e.travel += travel;
      e.total += total;
      e.cnt += 1;

      if (r.work_date) {
        e._days.add(r.work_date);
      }

      map.set(key, e);
    }

    return Array.from(map.values())
      .map((e) => ({
        ...e,
        days: e._days ? e._days.size : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

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
          _days: new Set(),
        };

      e.work += work;
      e.travel += travel;
      e.total += total;
      e.cnt += 1;
      if (r.work_date) e._days.add(r.work_date);

      map.set(key, e);
    }

    return Array.from(map.values())
      .map((e) => ({
        ...e,
        days: e._days ? e._days.size : 0,
      }))
      .sort((a, b) => a.emp.localeCompare(b.emp) || a.prj.localeCompare(b.prj));
  }, [rows]);

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

  const buakSoll = useMemo(() => {
    if (activeRange.mode === "year" && activeRange.yearForBuak) {
      return calcBuakSollHoursForYear(parseInt(activeRange.yearForBuak, 10));
    }
    return calcBuakSollForMonthList(activeRange.monthList);
  }, [activeRange]);

  const buakDiff = useMemo(
    () => totals.totalH - buakSoll,
    [totals.totalH, buakSoll]
  );

  const hasData = rows.length > 0;

  function exportCSV() {
    const lines = [];
    lines.push(`Auswertung ${rangeLabel}`);
    lines.push("");

    lines.push("PROJEKTE");
    lines.push(
      [
        "Projekt",
        "Arbeitsstunden",
        "Fahrzeit (h)",
        "Gesamt (h)",
        "Anzahl Tage",
        "Einträge",
      ].join(";")
    );

    for (const p of byProject) {
      const label = p.code ? `${p.code} · ${p.name}` : p.name;
      lines.push(
        [
          label,
          h2(p.work).toFixed(2),
          h2(p.travel).toFixed(2),
          h2(p.total).toFixed(2),
          p.days ?? 0,
          p.cnt,
        ].join(";")
      );
    }

    lines.push("");
    lines.push("MITARBEITER");
    lines.push(
      [
        "Mitarbeiter",
        "Arbeitsstunden",
        "Fahrzeit (h)",
        "Gesamt (h)",
        "Anzahl Tage",
        "Einträge",
      ].join(";")
    );

    for (const e of byEmployee) {
      lines.push(
        [
          e.name,
          h2(e.work).toFixed(2),
          h2(e.travel).toFixed(2),
          h2(e.total).toFixed(2),
          e.days ?? 0,
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
        "Anzahl Tage",
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
          r.days ?? 0,
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

  function openPdfDialog() {
    setPdfOptions((prev) => ({
      ...prev,
      selectedEmployeeCodes: selectedCodes.length
        ? [...selectedCodes]
        : employees.map((e) => e.code),
    }));
    setShowPdfDialog(true);
  }

  function exportPDF() {
    const selectedRows = rows.filter((r) => {
      const emp = employees.find((e) => e.id === r.employee_id);
      return pdfOptions.selectedEmployeeCodes.includes(emp?.code);
    });

    if (!selectedRows.length) {
      alert("Keine Daten für den PDF Export ausgewählt.");
      return;
    }

    const selectedNames = employees
      .filter((e) => pdfOptions.selectedEmployeeCodes.includes(e.code))
      .map((e) => e.name || e.code);

    const exportByProject = (() => {
      const map = new Map();

      for (const r of selectedRows) {
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
            _days: new Set(),
          };

        e.work += work;
        e.travel += travel;
        e.total += total;
        e.cnt += 1;
        if (r.work_date) e._days.add(r.work_date);

        map.set(key, e);
      }

      return Array.from(map.values())
        .map((e) => ({
          ...e,
          days: e._days ? e._days.size : 0,
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    })();

    const exportByEmployee = (() => {
      const map = new Map();

      for (const r of selectedRows) {
        const { work, travel, total } = splitMinutes(r);
        const key = r.employee_name || r.employee_id || "—";

        const e =
          map.get(key) || {
            name: key,
            work: 0,
            travel: 0,
            total: 0,
            cnt: 0,
            _days: new Set(),
          };

        e.work += work;
        e.travel += travel;
        e.total += total;
        e.cnt += 1;

        if (r.work_date) {
          e._days.add(r.work_date);
        }

        map.set(key, e);
      }

      return Array.from(map.values())
        .map((e) => ({
          ...e,
          days: e._days ? e._days.size : 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    })();

    const exportByEmployeeProject = (() => {
      const map = new Map();

      for (const r of selectedRows) {
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
            _days: new Set(),
          };

        e.work += work;
        e.travel += travel;
        e.total += total;
        e.cnt += 1;
        if (r.work_date) e._days.add(r.work_date);

        map.set(key, e);
      }

      return Array.from(map.values())
        .map((e) => ({
          ...e,
          days: e._days ? e._days.size : 0,
        }))
        .sort(
          (a, b) => a.emp.localeCompare(b.emp) || a.prj.localeCompare(b.prj)
        );
    })();

    const exportTotals = (() => {
      let work = 0,
        travel = 0,
        total = 0;

      for (const r of selectedRows) {
        const m = splitMinutes(r);
        work += m.work;
        travel += m.travel;
        total += m.total;
      }

      return { workH: h2(work), travelH: h2(travel), totalH: h2(total) };
    })();

    const selectedEmployeeCount = uniq(
      selectedRows.map((r) => r.employee_name || String(r.employee_id || "—"))
    ).length;

    const exportBuakSollBase =
      activeRange.mode === "year" && activeRange.yearForBuak
        ? calcBuakSollHoursForYear(parseInt(activeRange.yearForBuak, 10))
        : calcBuakSollForMonthList(activeRange.monthList);

    const exportBuakSoll = exportBuakSollBase * (selectedEmployeeCount || 1);
    const exportBuakDiff = exportTotals.totalH - exportBuakSoll;

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    doc.setFontSize(16);
    doc.text(`Auswertung ${rangeLabel}`, 40, 40);

    doc.setFontSize(10);
    doc.text(
      `Mitarbeiter: ${selectedNames.length ? selectedNames.join(", ") : "—"}`,
      40,
      58
    );

    doc.text(
      `Inhalt: ${
        [
          pdfOptions.includeProjects ? "Projekte" : null,
          pdfOptions.includeEmployees ? "Mitarbeiter" : null,
          pdfOptions.includeEmployeeProjects ? "Mitarbeiter x Projekt" : null,
          pdfOptions.includeWorkHours ? "Arbeitsstunden" : null,
          pdfOptions.includeTotalHours ? "Gesamtstunden" : null,
          pdfOptions.includeTravel ? "Fahrzeit" : null,
          pdfOptions.includeDays ? "Anzahl Tage" : null,
          pdfOptions.includeBuak ? "BUAK Sollstunden" : null,
        ]
          .filter(Boolean)
          .join(", ") || "—"
      }`,
      40,
      74
    );

    let y = 92;
    let drewSomething = false;

    if (pdfOptions.includeProjects) {
      autoTable(doc, {
        head: [[
          "Projekt",
          ...(pdfOptions.includeWorkHours ? ["Arbeitsstunden"] : []),
          ...(pdfOptions.includeTravel ? ["Fahrzeit (h)"] : []),
          ...(pdfOptions.includeTotalHours ? ["Gesamt (h)"] : []),
          ...(pdfOptions.includeDays ? ["Anzahl Tage"] : []),
          "Einträge",
        ]],
        body: exportByProject.map((p) => [
          p.code ? `${p.code} · ${p.name}` : p.name,
          ...(pdfOptions.includeWorkHours ? [h2(p.work).toFixed(2)] : []),
          ...(pdfOptions.includeTravel ? [h2(p.travel).toFixed(2)] : []),
          ...(pdfOptions.includeTotalHours ? [h2(p.total).toFixed(2)] : []),
          ...(pdfOptions.includeDays ? [p.days ?? 0] : []),
          p.cnt,
        ]),
        startY: y,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [123, 74, 45] },
        margin: { left: 40, right: 40 },
      });
      y = (doc.lastAutoTable?.finalY || y) + 18;
      drewSomething = true;
    }

    if (
      pdfOptions.includeBuak ||
      pdfOptions.includeTravel ||
      pdfOptions.includeWorkHours ||
      pdfOptions.includeTotalHours ||
      pdfOptions.includeDays
    ) {
      if (y > doc.internal.pageSize.getHeight() - 80) {
        doc.addPage();
        y = 40;
      }

      doc.setFontSize(11);

      const sumParts = [];
      if (pdfOptions.includeBuak)
        sumParts.push(`Soll (BUAK): ${exportBuakSoll.toFixed(2)} h`);
      if (pdfOptions.includeTotalHours)
        sumParts.push(`Ist: ${exportTotals.totalH.toFixed(2)} h`);
      if (pdfOptions.includeBuak)
        sumParts.push(`Abw.: ${exportBuakDiff.toFixed(2)} h`);
      if (pdfOptions.includeWorkHours)
        sumParts.push(`Arbeit: ${exportTotals.workH.toFixed(2)} h`);
      if (pdfOptions.includeTravel)
        sumParts.push(`Fahrzeit: ${exportTotals.travelH.toFixed(2)} h`);
      if (pdfOptions.includeDays) {
        const totalDays = new Set(
          selectedRows
            .map((r) => `${r.employee_id || r.employee_name}||${r.work_date}`)
            .filter(Boolean)
        ).size;
        sumParts.push(`Anzahl Tage: ${totalDays}`);
      }

      doc.text(`Summen – ${sumParts.join(" | ")}`, 40, y);
      y += 16;
      drewSomething = true;
    }

    if (pdfOptions.includeEmployees) {
      if (y > doc.internal.pageSize.getHeight() - 120) {
        doc.addPage();
        y = 40;
      }

      autoTable(doc, {
        head: [[
          "Mitarbeiter",
          ...(pdfOptions.includeWorkHours ? ["Arbeitsstunden"] : []),
          ...(pdfOptions.includeTravel ? ["Fahrzeit (h)"] : []),
          ...(pdfOptions.includeTotalHours ? ["Gesamt (h)"] : []),
          ...(pdfOptions.includeDays ? ["Anzahl Tage"] : []),
          "Einträge",
        ]],
        body: exportByEmployee.map((e) => [
          e.name,
          ...(pdfOptions.includeWorkHours ? [h2(e.work).toFixed(2)] : []),
          ...(pdfOptions.includeTravel ? [h2(e.travel).toFixed(2)] : []),
          ...(pdfOptions.includeTotalHours ? [h2(e.total).toFixed(2)] : []),
          ...(pdfOptions.includeDays ? [e.days ?? 0] : []),
          e.cnt,
        ]),
        startY: y,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [220, 220, 220] },
        margin: { left: 40, right: 40 },
      });
      y = (doc.lastAutoTable?.finalY || y) + 20;
      drewSomething = true;
    }

    if (pdfOptions.includeEmployeeProjects) {
      if (y > doc.internal.pageSize.getHeight() - 120) {
        doc.addPage();
        y = 40;
      }

      autoTable(doc, {
        head: [[
          "Mitarbeiter",
          "Projekt",
          ...(pdfOptions.includeWorkHours ? ["Arbeitsstunden"] : []),
          ...(pdfOptions.includeTravel ? ["Fahrzeit (h)"] : []),
          ...(pdfOptions.includeTotalHours ? ["Gesamt (h)"] : []),
          ...(pdfOptions.includeDays ? ["Anzahl Tage"] : []),
          "Einträge",
        ]],
        body: exportByEmployeeProject.map((r) => [
          r.emp,
          r.prj,
          ...(pdfOptions.includeWorkHours ? [h2(r.work).toFixed(2)] : []),
          ...(pdfOptions.includeTravel ? [h2(r.travel).toFixed(2)] : []),
          ...(pdfOptions.includeTotalHours ? [h2(r.total).toFixed(2)] : []),
          ...(pdfOptions.includeDays ? [r.days ?? 0] : []),
          r.cnt,
        ]),
        startY: y,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [240, 240, 240] },
        margin: { left: 40, right: 40 },
      });
      y = (doc.lastAutoTable?.finalY || y) + 20;
      drewSomething = true;
    }

    if (!drewSomething) {
      doc.setFontSize(11);
      doc.text("Keine Inhalte für den PDF Export ausgewählt.", 40, y);
    }

    doc.save(`Auswertung_${rangeLabel.replace(/\s+/g, "_")}.pdf`);
  }

  const handleCurrentMonth = () => {
    setRangeFromMonth("");
    setRangeToMonth("");
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
    setRangeFromMonth("");
    setRangeToMonth("");
    setMonthFilter(val);
    setYear(y);
  };

  const handleCurrentYear = () => {
    setYear(currentYear);
    setMonthFilter("");
    setRangeFromMonth("");
    setRangeToMonth("");
  };

  const handleMonthRange = () => {
    setMonthFilter("");
  };

  const summaryCards = [
    {
      label: "Arbeitsstunden",
      value: `${totals.workH.toFixed(2)} h`,
    },
    {
      label: "Fahrzeit",
      value: `${totals.travelH.toFixed(2)} h`,
    },
    {
      label: "Gesamtstunden",
      value: `${totals.totalH.toFixed(2)} h`,
    },
    {
      label: activeRange.mode === "year" ? "BUAK Soll" : "BUAK Soll Zeitraum",
      value: `${buakSoll.toFixed(2)} h`,
    },
    {
      label: "Abweichung",
      value: `${buakDiff.toFixed(2)} h`,
      tone: buakDiff >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <div className="year-overview">
      <div className="year-overview-hero hbz-card">
        <div className="year-overview-hero__content">
          <div>
            <div className="year-overview-kicker">Auswertung</div>
            <h2 className="year-overview-title">Jahresübersicht</h2>
            <div className="year-overview-subtitle">
              Zeitraum: <b>{rangeLabel}</b>
            </div>
          </div>

          <div className="year-overview-actions">
            <button
              onClick={openPdfDialog}
              className="hbz-btn hbz-btn-primary"
              disabled={!hasData}
            >
              PDF export
            </button>
            <button
              onClick={exportCSV}
              className="hbz-btn"
              disabled={!hasData}
            >
              CSV export
            </button>
          </div>
        </div>
      </div>

      <div className="year-overview-topgrid">
        <div className="hbz-card year-filter-card">
          <div className="year-card-title">Filter</div>

          <div className="year-filter-grid">
            <div className="field-inline">
              <label className="hbz-label">Jahr</label>
              <select
                value={year}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  setYear(y);
                }}
                className="hbz-select"
              >
                {Array.from({ length: 8 }, (_, i) => currentYear - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
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

          <div className="year-employee-block">
            <div className="year-employee-head">
              <label className="hbz-label">Mitarbeiter</label>
              <span className="badge-soft">
                {selectedCodes.length} / {employees.length} gewählt
              </span>
            </div>

            <div className="year-chip-actions">
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

            <div className="year-chip-list">
              {employees.map((e) => {
                const active = selectedCodes.includes(e.code);
                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`year-chip ${active ? "active" : ""}`}
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
        </div>

        <div className="hbz-card year-range-card">
          <div className="year-card-title">Zeitraum</div>

          <div className="year-range-quick">
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

            <button
              type="button"
              className="hbz-btn btn-small"
              onClick={handleCurrentYear}
            >
              Aktuelles Jahr
            </button>
          </div>

          <div className="year-range-grid">
            <div className="field-inline">
              <label className="hbz-label">Einzelner Monat</label>
              <input
                type="month"
                className="hbz-input"
                value={monthFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  setRangeFromMonth("");
                  setRangeToMonth("");
                  setMonthFilter(v);
                  const mr = getMonthRange(v);
                  if (mr) setYear(mr.year);
                }}
              />
            </div>

            <div className="field-inline">
              <label className="hbz-label">Von</label>
              <input
                type="month"
                className="hbz-input"
                value={rangeFromMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  setRangeFromMonth(v);
                  handleMonthRange();
                  const mr = getMonthRange(v);
                  if (mr) setYear(mr.year);
                }}
              />
            </div>

            <div className="field-inline">
              <label className="hbz-label">Bis</label>
              <input
                type="month"
                className="hbz-input"
                value={rangeToMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  setRangeToMonth(v);
                  handleMonthRange();
                }}
              />
            </div>
          </div>

          <div className="year-range-active">
            Aktuell ausgewählt: <b>{rangeLabel}</b>
          </div>
        </div>
      </div>

      <div className="year-summary-grid">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className={`year-summary-card ${card.tone || ""}`}
          >
            <div className="year-summary-label">{card.label}</div>
            <div className="year-summary-value">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="hbz-card year-main-card">
        <div className="year-main-header">
          <div>
            <div className="year-card-title">Auswertung</div>
            <div className="year-main-subtitle">
              {loading
                ? "Lade…"
                : `Arbeit: ${totals.workH.toFixed(2)} h · Fahrzeit: ${totals.travelH.toFixed(
                    2
                  )} h · Gesamt: ${totals.totalH.toFixed(2)} h`}
            </div>
          </div>
        </div>

        {error && (
          <div className="year-error-box">
            <b>Hinweis:</b> {error}
          </div>
        )}

        {!hasData && !loading && (
          <div className="year-empty-state">
            Keine Einträge für diese Filter.
          </div>
        )}

        {hasData && (
          <div className="year-sections">
            <section className="year-section">
              <div className="year-section-head">
                <h3>Stunden je Projekt</h3>
                <span className="badge-soft">{byProject.length} Projekte</span>
              </div>

              <div className="year-table-wrap">
                <table className="year-table">
                  <thead>
                    <tr>
                      <th>Projekt</th>
                      <th className="num">Arbeitsstunden</th>
                      <th className="num">Fahrzeit (h)</th>
                      <th className="num">Gesamt (h)</th>
                      <th className="num">Anzahl Tage</th>
                      <th className="num">Einträge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProject.map((p) => (
                      <tr key={p.id}>
                        <td>{p.code ? `${p.code} · ${p.name}` : p.name}</td>
                        <td className="num">{h2(p.work).toFixed(2)}</td>
                        <td className="num">{h2(p.travel).toFixed(2)}</td>
                        <td className="num">{h2(p.total).toFixed(2)}</td>
                        <td className="num">{p.days ?? 0}</td>
                        <td className="num">{p.cnt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="year-section">
              <div className="year-section-head">
                <h3>Stunden je Mitarbeiter</h3>
                <span className="badge-soft">{byEmployee.length} Mitarbeiter</span>
              </div>

              <div className="year-table-wrap">
                <table className="year-table">
                  <thead>
                    <tr>
                      <th>Mitarbeiter</th>
                      <th className="num">Arbeitsstunden</th>
                      <th className="num">Fahrzeit (h)</th>
                      <th className="num">Gesamt (h)</th>
                      <th className="num">Anzahl Tage</th>
                      <th className="num">Einträge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byEmployee.map((e) => (
                      <tr key={e.name}>
                        <td>{e.name}</td>
                        <td className="num">{h2(e.work).toFixed(2)}</td>
                        <td className="num">{h2(e.travel).toFixed(2)}</td>
                        <td className="num">{h2(e.total).toFixed(2)}</td>
                        <td className="num">{e.days ?? 0}</td>
                        <td className="num">{e.cnt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="year-section">
              <div className="year-section-head">
                <h3>Aufschlüsselung je Mitarbeiter und Projekt</h3>
                <span className="badge-soft">
                  {byEmployeeProject.length} Kombinationen
                </span>
              </div>

              <div className="year-table-wrap">
                <table className="year-table">
                  <thead>
                    <tr>
                      <th>Mitarbeiter</th>
                      <th>Projekt</th>
                      <th className="num">Arbeitsstunden</th>
                      <th className="num">Fahrzeit (h)</th>
                      <th className="num">Gesamt (h)</th>
                      <th className="num">Anzahl Tage</th>
                      <th className="num">Einträge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byEmployeeProject.map((r) => (
                      <tr key={`${r.emp}||${r.prj}`}>
                        <td>{r.emp}</td>
                        <td>{r.prj}</td>
                        <td className="num">{h2(r.work).toFixed(2)}</td>
                        <td className="num">{h2(r.travel).toFixed(2)}</td>
                        <td className="num">{h2(r.total).toFixed(2)}</td>
                        <td className="num">{r.days ?? 0}</td>
                        <td className="num">{r.cnt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>

      {showPdfDialog && (
        <div className="year-modal-backdrop">
          <div className="year-modal">
            <div className="year-modal-head">
              <div>
                <div className="year-card-title">PDF Export auswählen</div>
                <div className="year-modal-subtitle">
                  Zeitraum: <b>{rangeLabel}</b>
                </div>
              </div>
              <button
                className="hbz-btn"
                onClick={() => setShowPdfDialog(false)}
              >
                Schließen
              </button>
            </div>

            <div className="year-modal-grid">
              <div className="year-modal-box">
                <div className="year-modal-box-title">Mitarbeiter</div>

                <div className="export-quick-actions">
                  <button
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
                    className="hbz-btn btn-small"
                    onClick={() =>
                      setPdfOptions((prev) => ({
                        ...prev,
                        selectedEmployeeCodes: [],
                      }))
                    }
                  >
                    Keine
                  </button>

                  <button
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

                <div className="year-modal-checklist">
                  {employees.map((e) => (
                    <label key={e.id} className="export-option">
                      <input
                        type="checkbox"
                        checked={pdfOptions.selectedEmployeeCodes.includes(
                          e.code
                        )}
                        onChange={(ev) => {
                          const checked = ev.target.checked;
                          setPdfOptions((prev) => ({
                            ...prev,
                            selectedEmployeeCodes: checked
                              ? [...prev.selectedEmployeeCodes, e.code]
                              : prev.selectedEmployeeCodes.filter(
                                  (c) => c !== e.code
                                ),
                          }));
                        }}
                      />
                      <div className="export-option-body">
                        <span className="export-option-title">{e.name}</span>
                        <span className="export-option-example">
                          Beispiel: Jahresauswertung nur für diesen Mitarbeiter
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="year-modal-box">
                <div className="year-modal-box-title">Exportinhalt</div>

                <div className="export-quick-actions">
                  <button
                    className="hbz-btn btn-small"
                    onClick={() =>
                      setPdfOptions((p) => ({
                        ...p,
                        includeProjects: true,
                        includeEmployees: true,
                        includeEmployeeProjects: true,
                        includeWorkHours: true,
                        includeTotalHours: true,
                        includeTravel: true,
                        includeDays: true,
                        includeBuak: true,
                      }))
                    }
                  >
                    Alles
                  </button>

                  <button
                    className="hbz-btn btn-small"
                    onClick={() =>
                      setPdfOptions((p) => ({
                        ...p,
                        includeProjects: false,
                        includeEmployees: true,
                        includeEmployeeProjects: false,
                        includeWorkHours: true,
                        includeTotalHours: true,
                        includeTravel: true,
                        includeDays: true,
                        includeBuak: true,
                      }))
                    }
                  >
                    AG kompakt
                  </button>

                  <button
                    className="hbz-btn btn-small"
                    onClick={() =>
                      setPdfOptions((p) => ({
                        ...p,
                        includeProjects: true,
                        includeEmployees: true,
                        includeEmployeeProjects: true,
                        includeWorkHours: true,
                        includeTotalHours: true,
                        includeTravel: true,
                        includeDays: true,
                        includeBuak: true,
                      }))
                    }
                  >
                    Intern detailliert
                  </button>
                </div>

                <div className="export-card-grid">
                  <div className="export-section">
                    <div className="export-section-title">Auswertung</div>

                    <label className="export-option">
                      <input
                        type="checkbox"
                        checked={pdfOptions.includeProjects}
                        onChange={(e) =>
                          setPdfOptions((p) => ({
                            ...p,
                            includeProjects: e.target.checked,
                          }))
                        }
                      />
                      <div className="export-option-body">
                        <span className="export-option-title">Projekte</span>
                        <span className="export-option-example">
                          Beispiel: Projekt A · 245,00 h · 18 Tage
                        </span>
                      </div>
                    </label>

                    <label className="export-option">
                      <input
                        type="checkbox"
                        checked={pdfOptions.includeEmployees}
                        onChange={(e) =>
                          setPdfOptions((p) => ({
                            ...p,
                            includeEmployees: e.target.checked,
                          }))
                        }
                      />
                      <div className="export-option-body">
                        <span className="export-option-title">Mitarbeiter</span>
                        <span className="export-option-example">
                          Beispiel: Stefan Zaunschirm · 1.622,50 h im Jahr
                        </span>
                      </div>
                    </label>

                    <label className="export-option">
                      <input
                        type="checkbox"
                        checked={pdfOptions.includeEmployeeProjects}
                        onChange={(e) =>
                          setPdfOptions((p) => ({
                            ...p,
                            includeEmployeeProjects: e.target.checked,
                          }))
                        }
                      />
                      <div className="export-option-body">
                        <span className="export-option-title">
                          Mitarbeiter x Projekt
                        </span>
                        <span className="export-option-example">
                          Beispiel: Stefan Zaunschirm · Projekt A · 132,00 h
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="export-section">
                    <div className="export-section-title">Kennzahlen</div>

                    <label className="export-option">
                      <input
                        type="checkbox"
                        checked={pdfOptions.includeWorkHours}
                        onChange={(e) =>
                          setPdfOptions((p) => ({
                            ...p,
                            includeWorkHours: e.target.checked,
                          }))
                        }
                      />
                      <div className="export-option-body">
                        <span className="export-option-title">
                          Arbeitsstunden
                        </span>
                        <span className="export-option-example">
                          Beispiel: reine Arbeitszeit ohne Fahrzeit
                        </span>
                      </div>
                    </label>

                    <label className="export-option">
                      <input
                        type="checkbox"
                        checked={pdfOptions.includeTotalHours}
                        onChange={(e) =>
                          setPdfOptions((p) => ({
                            ...p,
                            includeTotalHours: e.target.checked,
                          }))
                        }
                      />
                      <div className="export-option-body">
                        <span className="export-option-title">
                          Gesamtstunden
                        </span>
                        <span className="export-option-example">
                          Beispiel: Arbeitszeit + Fahrzeit = 1.740,00 h
                        </span>
                      </div>
                    </label>

                    <label className="export-option">
                      <input
                        type="checkbox"
                        checked={pdfOptions.includeTravel}
                        onChange={(e) =>
                          setPdfOptions((p) => ({
                            ...p,
                            includeTravel: e.target.checked,
                          }))
                        }
                      />
                      <div className="export-option-body">
                        <span className="export-option-title">Fahrzeit</span>
                        <span className="export-option-example">
                          Beispiel: 96,50 h Fahrzeit im Zeitraum
                        </span>
                      </div>
                    </label>

                    <label className="export-option">
                      <input
                        type="checkbox"
                        checked={pdfOptions.includeDays}
                        onChange={(e) =>
                          setPdfOptions((p) => ({
                            ...p,
                            includeDays: e.target.checked,
                          }))
                        }
                      />
                      <div className="export-option-body">
                        <span className="export-option-title">Anzahl Tage</span>
                        <span className="export-option-example">
                          Beispiel: 204 Arbeitstage im Jahr
                        </span>
                      </div>
                    </label>

                    <label className="export-option">
                      <input
                        type="checkbox"
                        checked={pdfOptions.includeBuak}
                        onChange={(e) =>
                          setPdfOptions((p) => ({
                            ...p,
                            includeBuak: e.target.checked,
                          }))
                        }
                      />
                      <div className="export-option-body">
                        <span className="export-option-title">
                          BUAK Sollstunden
                        </span>
                        <span className="export-option-example">
                          Beispiel: Soll 1.704,00 h · Ist 1.740,00 h · Abweichung +36,00 h
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="year-modal-actions">
              <button
                className="hbz-btn"
                onClick={() => setShowPdfDialog(false)}
              >
                Abbrechen
              </button>

              <button
                className="hbz-btn hbz-btn-primary"
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