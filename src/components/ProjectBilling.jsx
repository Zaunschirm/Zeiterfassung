import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import { addPdfFooters, addPdfHeader, addPdfWatermarks, brandedTable, PDF_BRAND } from "../utils/pdfBranding";
import { formatCalculatedNumber, parseCalculatedNumber } from "../utils/calculatedInput";

const STORAGE_KEY = "hbz_project_billing_draft_v2";

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const yearStartISO = () => `${new Date().getFullYear()}-01-01`;
const parseNumber = (value) => parseCalculatedNumber(value, 0);
const fmtMoney = (value) => `€ ${parseNumber(value).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtHours = (minutes) => `${((Number(minutes) || 0) / 60).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
const fmtRegieHours = (hours) => `${(Number(hours) || 0).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
const fmtDate = (value) => {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "—";
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("de-AT");
};
const sumRegieHours = (items = []) => (Array.isArray(items) ? items : []).reduce((sum, item) => sum + parseNumber(item?.hours), 0);
const countRegieMaterials = (items = []) => (Array.isArray(items) ? items : []).filter((item) => String(item?.description || "").trim()).length;
const getTravel = (row) => Number(row?.travel_minutes ?? row?.travel_min ?? 0) || 0;
const rowWorkMinutes = (row) => Math.max((Number(row?.end_min ?? row?.to_min ?? 0) || 0) - (Number(row?.start_min ?? row?.from_min ?? 0) || 0) - (Number(row?.break_min || 0) || 0), 0);

async function loadPdfLibs() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default || autoTableModule.autoTable;
  if (typeof jsPDF !== "function" || typeof autoTable !== "function") throw new Error("PDF Bibliothek konnte nicht geladen werden.");
  return { jsPDF, autoTable };
}

const emptyBilling = () => ({
  contractNet: "",
  vatRate: "20",
  reverseCharge: false,
  discountPercent: "",
  discountNet: "",
  retentionPercent: "",
  coverageRetentionPercent: "",
  cashDiscountPercent: "",
  cashDiscountDays: "",
  workflowStatus: "Prüfen",
  closed: false,
  closedAt: "",
  closedByName: "",
  note: "",
  nextAction: "",
  supplements: [],
  invoices: [],
  clientDeductions: [],
  regieBilledIds: [],
});

const statusClass = (row) => {
  if (!row.contractNet && row.supplementNet <= 0) return "missing";
  if (row.workflowStatus === "Abgeschlossen" || (row.totalOrderNet > 0 && row.remainingNet <= 0)) return "done";
  if (["In Rechnung", "Verrechnet"].includes(row.workflowStatus)) return "partial";
  if (row.invoicedNet > 0) return "partial";
  if (row.readyScore >= 80) return "ready";
  return "open";
};

const statusLabel = (row) => {
  if (!row.contractNet && row.supplementNet <= 0) return "Auftragssumme fehlt";
  if (statusClass(row) === "done") return "Abgeschlossen";
  if (["Regie geprüft", "In Rechnung", "Verrechnet"].includes(row.workflowStatus)) return row.workflowStatus;
  if (statusClass(row) === "partial") return "Teilabgerechnet";
  if (statusClass(row) === "ready") return "Bereit zur Prüfung";
  return row.workflowStatus || "Offen";
};

export default function ProjectBilling() {
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [regieReports, setRegieReports] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [billingByProject, setBillingByProject] = useState({});
  const [auditByProject, setAuditByProject] = useState({});
  const [persistAvailable, setPersistAvailable] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [from, setFrom] = useState(yearStartISO());
  const [to, setTo] = useState(todayISO());
  const [query, setQuery] = useState("");
  const [archiveFilter, setArchiveFilter] = useState("active");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setBillingByProject(JSON.parse(raw) || {});
    } catch (e) {
      console.warn("[ProjectBilling] Lokale Daten konnten nicht gelesen werden:", e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(billingByProject));
    } catch (e) {
      console.warn("[ProjectBilling] Lokale Daten konnten nicht gespeichert werden:", e);
    }
  }, [billingByProject]);

  async function load() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const [projectResult, entryResult, regieResult, dailyResult] = await Promise.all([
        supabase.from("projects").select("*").order("active", { ascending: false }).order("name", { ascending: true }),
        supabase.from("v_time_entries_expanded").select("*").gte("work_date", from).lte("work_date", to).order("work_date", { ascending: true }),
        supabase.from("regie_reports").select("id,report_number,project_id,project_name,status,is_archived,report_date,labor_items,material_items,signed_at").order("report_date", { ascending: false }).limit(1000),
        supabase.from("daily_site_reports").select("id,project_id,project_name,status,report_date").gte("report_date", from).lte("report_date", to).order("report_date", { ascending: false }),
      ]);
      const firstError = projectResult.error || entryResult.error || regieResult.error || dailyResult.error;
      if (firstError) throw firstError;
      setProjects(projectResult.data || []);
      setEntries(entryResult.data || []);
      setRegieReports(regieResult.data || []);
      setDailyReports(dailyResult.data || []);

      const [billingResult, auditResult] = await Promise.all([
        supabase.from("project_billing_records").select("*"),
        supabase.from("project_billing_audit_log").select("*").order("changed_at", { ascending: false }).limit(500),
      ]);

      if (billingResult.error || auditResult.error) {
        setPersistAvailable(false);
        console.warn("[ProjectBilling] Supabase-Abrechnungstabellen fehlen vermutlich noch:", billingResult.error?.message || auditResult.error?.message);
      } else {
        setPersistAvailable(true);
        const nextBilling = {};
        for (const record of billingResult.data || []) {
          nextBilling[String(record.project_id)] = {
            ...emptyBilling(),
            ...(record.billing_data || {}),
            closed: record.is_closed === true || record.billing_data?.closed === true,
            closedAt: record.closed_at || record.billing_data?.closedAt || "",
            closedByName: record.closed_by_name || record.billing_data?.closedByName || "",
          };
        }
        setBillingByProject(nextBilling);

        const nextAudit = {};
        for (const row of auditResult.data || []) {
          const id = String(row.project_id || "");
          if (!nextAudit[id]) nextAudit[id] = [];
          nextAudit[id].push(row);
        }
        setAuditByProject(nextAudit);
      }
    } catch (e) {
      console.error("[ProjectBilling] Load error:", e);
      setError(e?.message || "Abrechnungsdaten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const rows = useMemo(() => {
    const byProject = new Map();

    for (const project of projects) {
      byProject.set(String(project.id), {
        project,
        workMinutes: 0,
        travelMinutes: 0,
        entries: 0,
        days: new Set(),
        regieOpen: 0,
        regieSigned: 0,
        signedRegieReports: [],
        openRegieReports: [],
        dailyDraft: 0,
        dailyDone: 0,
      });
    }

    for (const entry of entries) {
      const id = String(entry.project_id || "");
      if (!id) continue;
      if (!byProject.has(id)) {
        byProject.set(id, {
          project: { id, name: entry.project_name || `Projekt ${id}` },
          workMinutes: 0,
          travelMinutes: 0,
          entries: 0,
          days: new Set(),
          regieOpen: 0,
          regieSigned: 0,
          signedRegieReports: [],
          openRegieReports: [],
          dailyDraft: 0,
          dailyDone: 0,
        });
      }
      const item = byProject.get(id);
      const travel = getTravel(entry);
      item.workMinutes += Math.max(rowWorkMinutes(entry) - travel, 0);
      item.travelMinutes += travel;
      item.entries += 1;
      if (entry.work_date) item.days.add(String(entry.work_date).slice(0, 10));
    }

    for (const report of regieReports) {
      const id = String(report.project_id || "");
      if (!id || !byProject.has(id) || report.is_archived) continue;
      const projectRow = byProject.get(id);
      if (report.status === "signed") {
        projectRow.regieSigned += 1;
        projectRow.signedRegieReports.push(report);
      } else {
        projectRow.regieOpen += 1;
        projectRow.openRegieReports.push(report);
      }
    }

    for (const report of dailyReports) {
      const id = String(report.project_id || "");
      if (!id || !byProject.has(id)) continue;
      if (report.status === "completed") byProject.get(id).dailyDone += 1;
      else byProject.get(id).dailyDraft += 1;
    }

    return [...byProject.values()].map((item) => {
      const billing = { ...emptyBilling(), ...(billingByProject[String(item.project.id)] || {}) };
      const supplements = Array.isArray(billing.supplements) ? billing.supplements : [];
      const invoices = Array.isArray(billing.invoices) ? billing.invoices : [];
      const clientDeductions = Array.isArray(billing.clientDeductions) ? billing.clientDeductions : [];
      const regieBilledIds = Array.isArray(billing.regieBilledIds) ? billing.regieBilledIds.map(String) : [];
      const regieBilledSet = new Set(regieBilledIds);
      const signedRegieReports = (item.signedRegieReports || []).map((report) => {
        const hours = sumRegieHours(report.labor_items);
        const materialCount = countRegieMaterials(report.material_items);
        const id = String(report.id);
        return { ...report, id, hours, materialCount, billed: regieBilledSet.has(id) };
      });
      const regieBillableOpen = signedRegieReports.filter((report) => !report.billed);
      const contractNet = parseNumber(billing.contractNet);
      const supplementNet = supplements.filter((s) => s.status !== "Storniert").reduce((sum, s) => sum + parseNumber(s.net), 0);
      const orderNetBeforeDiscount = contractNet + supplementNet;
      const discountPercentAmount = orderNetBeforeDiscount * (parseNumber(billing.discountPercent) / 100);
      const discountAmount = Math.min(orderNetBeforeDiscount, discountPercentAmount + parseNumber(billing.discountNet));
      const totalOrderNet = Math.max(orderNetBeforeDiscount - discountAmount, 0);
      const invoicedNet = invoices.filter((i) => i.status !== "Storniert").reduce((sum, i) => sum + parseNumber(i.net), 0);
      const clientDeductionNet = clientDeductions.filter((d) => d.status !== "Storniert").reduce((sum, d) => sum + parseNumber(d.net), 0);
      const remainingNet = totalOrderNet - invoicedNet - clientDeductionNet;
      const vatRate = billing.reverseCharge ? 0 : parseNumber(billing.vatRate || "20");
      const progress = totalOrderNet > 0 ? Math.min(100, Math.max(0, (invoicedNet / totalOrderNet) * 100)) : 0;
      const retentionAmount = totalOrderNet * (parseNumber(billing.retentionPercent) / 100);
      const coverageRetentionAmount = totalOrderNet * (parseNumber(billing.coverageRetentionPercent) / 100);
      const cashDiscountAmount = totalOrderNet * (parseNumber(billing.cashDiscountPercent) / 100);
      const payableAfterRetentions = Math.max(totalOrderNet - retentionAmount - coverageRetentionAmount, 0);

      const checks = [
        { key: "contract", label: "Auftragssumme oder Nachtrag vorhanden", ok: totalOrderNet > 0 },
        { key: "tax", label: "USt / §19 geklärt", ok: billing.reverseCharge || vatRate > 0 },
        { key: "client", label: "Auftraggeber eingetragen", ok: Boolean(item.project?.client_name) },
        { key: "cost", label: "Kostenstelle vorhanden", ok: Boolean(item.project?.cost_center || item.project?.external_cost_center) },
        { key: "regie", label: "Keine offenen Regieberichte", ok: item.regieOpen === 0 },
        { key: "regieBilling", label: "Unterschriebene Regieberichte verrechnet/geprüft", ok: regieBillableOpen.length === 0 },
        { key: "daily", label: "Keine offenen Bautagesberichte", ok: item.dailyDraft === 0 },
      ];
      const readyScore = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

      return {
        ...item,
        billing,
        supplements,
        invoices,
        clientDeductions,
        signedRegieReports,
        regieBillableOpen,
        regieBilledIds,
        contractNet,
        supplementNet,
        orderNetBeforeDiscount,
        discountAmount,
        totalOrderNet,
        vatRate,
        invoicedNet,
        clientDeductionNet,
        remainingNet,
        progress,
        retentionAmount,
        coverageRetentionAmount,
        cashDiscountAmount,
        payableAfterRetentions,
        checks,
        readyScore,
        workflowStatus: billing.workflowStatus || "Prüfen",
        grossOrder: billing.reverseCharge ? totalOrderNet : totalOrderNet * (1 + vatRate / 100),
      };
    });
  }, [projects, entries, regieReports, dailyReports, billingByProject]);

  const billingArchivedRows = useMemo(
    () => rows.filter((row) => row.billing?.closed === true || row.workflowStatus === "Abgeschlossen"),
    [rows]
  );
  const billingActiveRows = useMemo(
    () => rows.filter((row) => !(row.billing?.closed === true || row.workflowStatus === "Abgeschlossen")),
    [rows]
  );

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        const archived = row.billing?.closed === true || row.workflowStatus === "Abgeschlossen";
        if (archiveFilter === "active" && archived) return false;
        if (archiveFilter === "archive" && !archived) return false;
        if (statusFilter !== "all" && statusClass(row) !== statusFilter) return false;
        if (!q) return true;
        const p = row.project || {};
        return `${p.name || ""} ${p.cost_center || ""} ${p.external_cost_center || ""} ${p.client_name || ""} ${p.client_contact || ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => String(a.project?.name || "").localeCompare(String(b.project?.name || ""), "de"));
  }, [rows, query, archiveFilter, statusFilter]);

  const selectedRow = useMemo(() => {
    if (!selectedProjectId) return visibleRows[0] || null;
    return visibleRows.find((row) => String(row.project.id) === String(selectedProjectId)) || visibleRows[0] || null;
  }, [selectedProjectId, visibleRows]);

  const totals = useMemo(() => visibleRows.reduce(
    (sum, row) => {
      sum.order += row.totalOrderNet;
      sum.invoiced += row.invoicedNet;
      sum.remaining += row.remainingNet;
      sum.work += row.workMinutes;
      sum.travel += row.travelMinutes;
      if (row.readyScore >= 80) sum.ready += 1;
      return sum;
    },
    { order: 0, invoiced: 0, remaining: 0, work: 0, travel: 0, ready: 0 }
  ), [visibleRows]);

  async function persistBilling(projectId, data, action = "updated") {
    if (!persistAvailable) return;
    const session = getSession()?.user || {};
    const id = String(projectId);
    const isClosed = data.closed === true || data.workflowStatus === "Abgeschlossen";
    try {
      const payload = {
        project_id: id,
        billing_data: data,
        is_closed: isClosed,
        closed_at: isClosed ? (data.closedAt || new Date().toISOString()) : null,
        closed_by: isClosed ? String(session.id || session.code || "") : null,
        closed_by_name: isClosed ? (session.name || session.code || null) : null,
        updated_at: new Date().toISOString(),
        updated_by: String(session.id || session.code || ""),
        updated_by_name: session.name || session.code || null,
      };
      const { error: upsertError } = await supabase.from("project_billing_records").upsert(payload, { onConflict: "project_id" });
      if (upsertError) throw upsertError;
      const { data: auditRow, error: auditError } = await supabase.from("project_billing_audit_log").insert({
        project_id: id,
        action,
        changed_by: String(session.id || session.code || ""),
        changed_by_name: session.name || session.code || null,
        changes: data,
      }).select().single();
      if (auditError) throw auditError;
      if (auditRow) {
        setAuditByProject((prev) => ({ ...prev, [id]: [auditRow, ...(prev[id] || [])].slice(0, 50) }));
      }
    } catch (e) {
      console.warn("[ProjectBilling] Speichern in Supabase fehlgeschlagen:", e?.message || e);
      setPersistAvailable(false);
      setMessage("Abrechnung lokal gespeichert. Supabase-Tabelle fehlt vermutlich noch.");
    }
  }

  const updateBilling = (projectId, updater) => {
    setBillingByProject((prev) => {
      const id = String(projectId);
      const current = { ...emptyBilling(), ...(prev[id] || {}) };
      if (current.closed === true) {
        setMessage("Abrechnung ist abgeschlossen. Bitte zuerst wieder öffnen.");
        return prev;
      }
      const next = updater(current);
      persistBilling(id, next, "updated");
      return { ...prev, [id]: next };
    });
  };

  const addSupplement = (projectId) => {
    updateBilling(projectId, (current) => ({
      ...current,
      supplements: [...(current.supplements || []), { id: `nt-${Date.now()}`, title: `Nachtrag ${(current.supplements?.length || 0) + 1}`, net: "", status: "Offen" }],
    }));
    setMessage("Nachtrag angelegt.");
  };

  const addInvoice = (row) => {
    const nextNet = Math.max(row.remainingNet, 0);
    updateBilling(row.project.id, (current) => ({
      ...current,
      invoices: [...(current.invoices || []), { id: `tr-${Date.now()}`, invoiceNumber: "", date: todayISO(), title: `${(current.invoices?.length || 0) + 1}. Teilrechnung`, period: `${from} bis ${to}`, net: nextNet ? String(nextNet.toFixed(2)) : "", status: "Entwurf", paidAt: "" }],
    }));
    setMessage("Teilrechnung mit Restbetrag-Vorschlag angelegt.");
  };

  const setRegieReportBilled = (row, reportId, billed = true) => {
    const report = (row.signedRegieReports || []).find((item) => String(item.id) === String(reportId));
    updateBilling(row.project.id, (current) => {
      const ids = new Set((Array.isArray(current.regieBilledIds) ? current.regieBilledIds : []).map(String));
      if (billed) ids.add(String(reportId));
      else ids.delete(String(reportId));
      return { ...current, regieBilledIds: [...ids] };
    });
    setMessage(billed ? `Regiebericht ${report?.report_number || reportId} als verrechnet markiert.` : `Regiebericht ${report?.report_number || reportId} wieder als offen markiert.`);
  };

  const addClientDeduction = (projectId) => {
    updateBilling(projectId, (current) => ({
      ...current,
      clientDeductions: [
        ...(current.clientDeductions || []),
        {
          id: `ag-${Date.now()}`,
          date: todayISO(),
          reason: "",
          net: "",
          status: "Offen",
          note: "",
        },
      ],
    }));
    setMessage("AG-Abzug angelegt.");
  };

  const updateListItem = (projectId, listName, itemId, patch) => {
    updateBilling(projectId, (current) => ({
      ...current,
      [listName]: (current[listName] || []).map((item) => item.id === itemId ? { ...item, ...patch } : item),
    }));
  };

  const removeListItem = (projectId, listName, itemId) => {
    updateBilling(projectId, (current) => ({
      ...current,
      [listName]: (current[listName] || []).filter((item) => item.id !== itemId),
    }));
  };

  const closeBilling = (row) => {
    const now = new Date().toISOString();
    updateBilling(row.project.id, (current) => ({
      ...current,
      workflowStatus: "Abgeschlossen",
      closed: true,
      closedAt: now,
      closedByName: getSession()?.user?.name || getSession()?.user?.code || "",
    }));
    setArchiveFilter("archive");
    setSelectedProjectId(String(row.project.id));
    setMessage("Projektabrechnung abgeschlossen und in die Ablage verschoben.");
  };

  const reopenBilling = (row) => {
    setBillingByProject((prev) => {
      const id = String(row.project.id);
      const current = { ...emptyBilling(), ...(prev[id] || {}) };
      const next = { ...current, workflowStatus: "Prüfen", closed: false, closedAt: "", closedByName: "" };
      persistBilling(id, next, "reopened");
      return { ...prev, [id]: next };
    });
    setArchiveFilter("active");
    setSelectedProjectId(String(row.project.id));
    setMessage("Projektabrechnung wieder geöffnet und zurück zu laufenden Aufträgen verschoben.");
  };

  async function exportProjectPdf(row) {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      addPdfHeader(doc, { title: "Projektabrechnung", subtitle: row.project.name, rightTop: todayISO() });
      autoTable(doc, {
        startY: 86,
        theme: "grid",
        ...brandedTable,
        body: [
          ["Projekt", row.project.name || "—", "Auftraggeber", row.project.client_name || "—"],
          ["Kostenstelle", row.project.cost_center || "—", "Externe Kostenstelle", row.project.external_cost_center || "—"],
          ["Bauleiter", row.project.client_contact || "—", "Adresse", row.project.address || "—"],
          ["Status", statusLabel(row), "Zeitraum", `${from} bis ${to}`],
        ],
      });
      let y = doc.lastAutoTable.finalY + 16;
      autoTable(doc, {
        startY: y,
        theme: "striped",
        ...brandedTable,
        head: [["Position", "Betrag / Wert"]],
        body: [
          ["Hauptauftrag netto", fmtMoney(row.contractNet)],
          ["Nachträge netto", fmtMoney(row.supplementNet)],
          ["Ausgangssumme netto", fmtMoney(row.orderNetBeforeDiscount)],
          ["Nachlass", fmtMoney(row.discountAmount)],
          ["Gesamt netto", fmtMoney(row.totalOrderNet)],
          ["USt / §19", row.billing.reverseCharge ? "§19 Reverse Charge" : `${row.vatRate}%`],
          ["Gesamt brutto", fmtMoney(row.grossOrder)],
          ["Haftrücklass", fmtMoney(row.retentionAmount)],
          ["Deckungsrücklass", fmtMoney(row.coverageRetentionAmount)],
          ["Skonto", `${fmtMoney(row.cashDiscountAmount)}${row.billing.cashDiscountDays ? ` bei Zahlung binnen ${row.billing.cashDiscountDays} Tagen` : ""}`],
          ["Teilrechnungen netto", fmtMoney(row.invoicedNet)],
          ["AG-Abzüge netto", fmtMoney(row.clientDeductionNet)],
          ["Unverrechnete Regieberichte", String(row.regieBillableOpen.length)],
          ["Offener Rest netto", fmtMoney(row.remainingNet)],
        ],
      });
      y = doc.lastAutoTable.finalY + 16;
      if (row.invoices.length) {
        autoTable(doc, { startY: y, theme: "striped", ...brandedTable, head: [["Nr.", "Datum", "Text", "Zeitraum", "Netto", "Status", "Bezahlt am"]], body: row.invoices.map((i) => [i.invoiceNumber || "—", i.date || "—", i.title || "—", i.period || "—", fmtMoney(i.net), i.status || "—", i.paidAt || "—"]) });
        y = doc.lastAutoTable.finalY + 16;
      }
      if (row.clientDeductions.length) {
        autoTable(doc, { startY: y, theme: "striped", ...brandedTable, head: [["Datum", "Grund", "Netto", "Status", "Notiz"]], body: row.clientDeductions.map((d) => [d.date || "—", d.reason || "—", fmtMoney(d.net), d.status || "—", d.note || "—"]) });
        y = doc.lastAutoTable.finalY + 16;
      }
      if (row.signedRegieReports.length) {
        autoTable(doc, { startY: y, theme: "striped", ...brandedTable, head: [["Regiebericht", "Datum", "Stunden", "Material", "Status"]], body: row.signedRegieReports.map((report) => [report.report_number || report.id, fmtDate(report.report_date), fmtRegieHours(report.hours), report.materialCount ? `${report.materialCount} Position(en)` : "—", report.billed ? "verrechnet" : "offen"]) });
        y = doc.lastAutoTable.finalY + 16;
      }
      autoTable(doc, { startY: y, theme: "grid", ...brandedTable, head: [["Prüfpunkt", "Status"]], body: row.checks.map((c) => [c.label, c.ok ? "OK" : "Offen"]) });
      if (row.billing.reverseCharge) {
        y = doc.lastAutoTable.finalY + 16;
        doc.setTextColor(...PDF_BRAND.darkBrown);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("Hinweis: Steuerschuld geht gemäß §19 UStG auf den Leistungsempfänger über.", 36, y);
      }
      await addPdfWatermarks(doc);
      addPdfFooters(doc, { label: "Projektabrechnung", detail: row.project.name });
      doc.save(`Projektabrechnung_${String(row.project.name || "Projekt").replace(/[^\wäöüÄÖÜß-]+/gi, "_")}.pdf`);
    } catch (e) {
      console.error("[ProjectBilling] PDF error:", e);
      setMessage(e?.message || "PDF konnte nicht erstellt werden.");
    }
  }

  async function exportProjectMapPdf(row) {
    try {
      const { jsPDF, autoTable } = await loadPdfLibs();
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const projectDailyReports = dailyReports.filter((report) => String(report.project_id || "") === String(row.project.id));
      addPdfHeader(doc, { title: "Projektmappe", subtitle: row.project.name, rightTop: todayISO() });
      autoTable(doc, {
        startY: 86,
        theme: "grid",
        ...brandedTable,
        body: [
          ["Projekt", row.project.name || "—", "Auftraggeber", row.project.client_name || "—"],
          ["Kostenstelle", row.project.cost_center || "—", "Externe Kostenstelle", row.project.external_cost_center || "—"],
          ["Bauleiter", row.project.client_contact || "—", "Adresse", row.project.address || "—"],
          ["Zeitraum", `${from} bis ${to}`, "Status", statusLabel(row)],
        ],
      });
      let y = doc.lastAutoTable.finalY + 16;
      autoTable(doc, {
        startY: y,
        theme: "striped",
        ...brandedTable,
        head: [["Bereich", "Stand"]],
        body: [
          ["Abrechnung", `${fmtMoney(row.totalOrderNet)} Auftrag netto · ${fmtMoney(row.remainingNet)} offen`],
          ["Regieberichte", `${row.signedRegieReports.length} unterfertigt · ${row.regieBillableOpen.length} unverrechnet · ${row.regieOpen} offen`],
          ["Bautagesberichte", `${row.dailyDone} abgeschlossen · ${row.dailyDraft} Entwurf`],
          ["Arbeitszeiten", `${fmtHours(row.workMinutes)} Arbeit · ${fmtHours(row.travelMinutes)} Fahrzeit · ${row.entries} Einträge`],
        ],
      });
      y = doc.lastAutoTable.finalY + 18;
      if (row.signedRegieReports.length) {
        autoTable(doc, { startY: y, theme: "striped", ...brandedTable, head: [["Regiebericht", "Datum", "Stunden", "Status"]], body: row.signedRegieReports.map((report) => [report.report_number || report.id, fmtDate(report.report_date), fmtRegieHours(report.hours), report.billed ? "verrechnet" : "offen"]) });
        y = doc.lastAutoTable.finalY + 18;
      }
      if (projectDailyReports.length) {
        autoTable(doc, { startY: y, theme: "striped", ...brandedTable, head: [["Bautagesbericht", "Datum", "Status"]], body: projectDailyReports.map((report) => [report.project_name || row.project.name, fmtDate(report.report_date), report.status === "completed" ? "abgeschlossen" : "Entwurf"]) });
        y = doc.lastAutoTable.finalY + 18;
      }
      autoTable(doc, { startY: y, theme: "grid", ...brandedTable, head: [["Prüfpunkt", "Status"]], body: row.checks.map((check) => [check.label, check.ok ? "OK" : "Offen"]) });
      await addPdfWatermarks(doc);
      addPdfFooters(doc, { label: "Projektmappe", detail: row.project.name });
      doc.save(`Projektmappe_${String(row.project.name || "Projekt").replace(/[^\wäöüÄÖÜß-]+/gi, "_")}.pdf`);
    } catch (e) {
      console.error("[ProjectBilling] Projektmappe PDF error:", e);
      setMessage(e?.message || "Projektmappe konnte nicht erstellt werden.");
    }
  }

  return (
    <div className="hbz-container billing-page">
      <header className="billing-hero">
        <div>
          <div className="eyebrow">Abrechnung</div>
          <h1>Projektabrechnung</h1>
          <p>Abrechnungsakte mit Auftragssumme, Nachträgen, Teilrechnungen, §19 und Prüfliste.</p>
        </div>
        <button className="hbz-btn" type="button" onClick={load} disabled={loading}>{loading ? "Aktualisiere…" : "Aktualisieren"}</button>
      </header>

      {error ? <div className="hbz-alert hbz-alert-error">{error}</div> : null}
      {message ? <div className="hbz-alert hbz-alert-info">{message}</div> : null}

      <section className="billing-summary-grid">
        <div className="billing-summary-card"><span>Auftrag + Nachträge netto</span><strong>{fmtMoney(totals.order)}</strong><small>{visibleRows.length} Projekte im Blick</small></div>
        <div className="billing-summary-card"><span>Bereits abgerechnet</span><strong>{fmtMoney(totals.invoiced)}</strong><small>aus Teilrechnungen</small></div>
        <div className="billing-summary-card"><span>Offener Rest netto</span><strong>{fmtMoney(totals.remaining)}</strong><small>{totals.ready} Projekte fast bereit</small></div>
        <div className="billing-summary-card"><span>Leistung im Zeitraum</span><strong>{fmtHours(totals.work)}</strong><small>{fmtHours(totals.travel)} Fahrzeit</small></div>
      </section>

      <section className="hbz-card billing-filters">
        <div className="billing-archive-tabs" aria-label="Abrechnungsablage">
          <button type="button" className={`billing-archive-tab ${archiveFilter === "active" ? "active" : ""}`} onClick={() => { setArchiveFilter("active"); setSelectedProjectId(""); }}>Laufend <span>{billingActiveRows.length}</span></button>
          <button type="button" className={`billing-archive-tab ${archiveFilter === "archive" ? "active" : ""}`} onClick={() => { setArchiveFilter("archive"); setSelectedProjectId(""); }}>Ablage <span>{billingArchivedRows.length}</span></button>
          <button type="button" className={`billing-archive-tab ${archiveFilter === "all" ? "active" : ""}`} onClick={() => { setArchiveFilter("all"); setSelectedProjectId(""); }}>Alle <span>{rows.length}</span></button>
        </div>
        <div className="billing-filter-grid">
          <label>Von<input className="hbz-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Bis<input className="hbz-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Ablage<select className="hbz-input" value={archiveFilter} onChange={(e) => { setArchiveFilter(e.target.value); setSelectedProjectId(""); }}><option value="active">Laufende Aufträge</option><option value="archive">Ablage abgeschlossen</option><option value="all">Alle anzeigen</option></select></label>
          <label>Status<select className="hbz-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Alle Status</option><option value="missing">Auftragssumme fehlt</option><option value="open">Offen / Prüfen</option><option value="ready">Bereit</option><option value="partial">Teilabgerechnet</option><option value="done">Abgeschlossen</option></select></label>
          <label>Suche<input className="hbz-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Projekt, Kostenstelle, Auftraggeber…" /></label>
        </div>
      </section>

      <div className="billing-workspace">
        <aside className="hbz-card billing-project-list">
          <div className="billing-section-head"><div><div className="eyebrow">{archiveFilter === "archive" ? "Ablage" : "Projektliste"}</div><h2>{archiveFilter === "archive" ? "Abgeschlossen" : "Auswahl"}</h2></div><span className="badge">{visibleRows.length}</span></div>
          {archiveFilter === "archive" ? <p className="billing-archive-hint">Abgeschlossene Aufträge sind abgelegt und bleiben für PDF, Kontrolle und spätere Rückfragen verfügbar.</p> : null}
          <div className="billing-project-items">
            {visibleRows.length === 0 ? <div className="billing-empty-box">{archiveFilter === "archive" ? "Noch keine abgeschlossenen Aufträge in der Ablage." : "Keine laufenden Aufträge für diese Filter."}</div> : null}
            {visibleRows.map((row) => (
              <button key={row.project.id} type="button" className={`billing-project-item ${String(selectedRow?.project?.id) === String(row.project.id) ? "active" : ""}`} onClick={() => setSelectedProjectId(String(row.project.id))}>
                <span className={`billing-status ${statusClass(row)}`}>{statusLabel(row)}</span>
                <b>{row.project.name}</b>
                <small>{row.project.cost_center || row.project.external_cost_center || row.project.client_name || "Keine Zusatzdaten"}</small>
                <em>{row.billing.closed ? "abgelegt" : `${fmtMoney(row.remainingNet)} offen`}</em>
              </button>
            ))}
          </div>
        </aside>

        <main className="hbz-card billing-file">
          {!selectedRow ? <p>Kein Projekt ausgewählt.</p> : (
            <>
              <div className="billing-file-head">
                <div>
                  <div className="eyebrow">Abrechnungsakte</div>
                  <h2>{selectedRow.project.name}</h2>
                  <p>{selectedRow.project.client_name || "Auftraggeber fehlt"}</p>
                </div>
                <div className="billing-head-actions">
                  <select className="hbz-input billing-workflow" disabled={selectedRow.billing.closed === true} value={selectedRow.workflowStatus} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, workflowStatus: e.target.value }))}>
                    <option>Offen</option><option>Prüfen</option><option>Regie geprüft</option><option>In Rechnung</option><option>Teilrechnung erstellt</option><option>Verrechnet</option><option>Schlussrechnung offen</option><option>Abgeschlossen</option>
                  </select>
                  <button className="hbz-btn btn-small" type="button" onClick={() => exportProjectPdf(selectedRow)}>PDF</button>
                  <button className="hbz-btn btn-small" type="button" onClick={() => exportProjectMapPdf(selectedRow)}>Projektmappe</button>
                  {selectedRow.billing.closed ? (
                    <button className="hbz-btn btn-small" type="button" onClick={() => reopenBilling(selectedRow)}>Wieder öffnen</button>
                  ) : (
                    <button className="hbz-btn btn-small" type="button" onClick={() => closeBilling(selectedRow)}>Abschließen</button>
                  )}
                </div>
              </div>
              {selectedRow.billing.closed ? <div className="billing-legal-note neutral">Diese Abrechnung ist abgeschlossen und gesperrt{selectedRow.billing.closedByName ? ` von ${selectedRow.billing.closedByName}` : ""}.</div> : null}

              <div className="billing-project-meta">
                <div><span>Kostenstelle</span><b>{selectedRow.project.cost_center || "—"}</b></div>
                <div><span>Externe Kostenstelle</span><b>{selectedRow.project.external_cost_center || "—"}</b></div>
                <div><span>Bauleiter / Kontakt</span><b>{selectedRow.project.client_contact || "—"}</b></div>
                <div><span>Adresse</span><b>{selectedRow.project.address || "—"}</b></div>
              </div>

              <section className="billing-progress-card">
                <div className="billing-progress-top">
                  <div><span>Abrechnungsfortschritt</span><strong>{selectedRow.progress.toFixed(0)}%</strong></div>
                  <div><span>Offen netto</span><strong>{fmtMoney(selectedRow.remainingNet)}</strong></div>
                </div>
                <div className="billing-progress-track"><span style={{ width: `${selectedRow.progress}%` }} /></div>
                <div className="billing-progress-legend"><span>Auftrag gesamt {fmtMoney(selectedRow.totalOrderNet)}</span><span>Abgerechnet {fmtMoney(selectedRow.invoicedNet)}</span></div>
              </section>

              <section className="billing-form-card">
                <h3>Auftrag & Steuer</h3>
                <div className="billing-editor-grid">
                  <label>Hauptauftrag netto<input className="hbz-input" inputMode="decimal" value={selectedRow.billing.contractNet || ""} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, contractNet: e.target.value }))} onBlur={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, contractNet: formatCalculatedNumber(e.target.value) }))} placeholder="z. B. 25000 oder 12000+3500" /></label>
                  <label>USt-Satz %<input className="hbz-input" inputMode="decimal" value={selectedRow.billing.vatRate ?? "20"} disabled={selectedRow.billing.reverseCharge} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, vatRate: e.target.value }))} onBlur={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, vatRate: formatCalculatedNumber(e.target.value) }))} /></label>
                </div>
                <label className="billing-check"><input type="checkbox" checked={selectedRow.billing.reverseCharge === true} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, reverseCharge: e.target.checked }))} /><span>§19 UStG / Reverse Charge</span></label>
                <div className="billing-money-box">
                  <div><span>Nachträge</span><b>{fmtMoney(selectedRow.supplementNet)}</b></div>
                  <div><span>Nachlass</span><b>{fmtMoney(selectedRow.discountAmount)}</b></div>
                  <div><span>Gesamt netto nach Nachlass</span><b>{fmtMoney(selectedRow.totalOrderNet)}</b></div>
                  <div><span>USt</span><b>{selectedRow.billing.reverseCharge ? "§19" : `${selectedRow.vatRate}%`}</b></div>
                  <div><span>Gesamt brutto</span><b>{fmtMoney(selectedRow.grossOrder)}</b></div>
                </div>
                {selectedRow.billing.reverseCharge ? <div className="billing-legal-note">PDF-Hinweis später: Steuerschuld geht gemäß §19 UStG auf den Leistungsempfänger über.</div> : null}
              </section>

              <section className="billing-form-card">
                <h3>Abzüge & Zahlungskonditionen</h3>
                <div className="billing-deduction-grid">
                  <label>
                    Nachlass %
                    <input className="hbz-input" inputMode="decimal" value={selectedRow.billing.discountPercent || ""} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, discountPercent: e.target.value }))} onBlur={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, discountPercent: formatCalculatedNumber(e.target.value) }))} placeholder="z. B. 3 oder 1+2" />
                  </label>
                  <label>
                    Nachlass Betrag netto
                    <input className="hbz-input" inputMode="decimal" value={selectedRow.billing.discountNet || ""} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, discountNet: e.target.value }))} onBlur={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, discountNet: formatCalculatedNumber(e.target.value) }))} placeholder="optional, z. B. 500+250" />
                  </label>
                  <label>
                    Haftrücklass %
                    <input className="hbz-input" inputMode="decimal" value={selectedRow.billing.retentionPercent || ""} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, retentionPercent: e.target.value }))} onBlur={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, retentionPercent: formatCalculatedNumber(e.target.value) }))} placeholder="z. B. 2" />
                  </label>
                  <label>
                    Deckungsrücklass %
                    <input className="hbz-input" inputMode="decimal" value={selectedRow.billing.coverageRetentionPercent || ""} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, coverageRetentionPercent: e.target.value }))} onBlur={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, coverageRetentionPercent: formatCalculatedNumber(e.target.value) }))} placeholder="z. B. 5" />
                  </label>
                  <label>
                    Skonto %
                    <input className="hbz-input" inputMode="decimal" value={selectedRow.billing.cashDiscountPercent || ""} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, cashDiscountPercent: e.target.value }))} onBlur={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, cashDiscountPercent: formatCalculatedNumber(e.target.value) }))} placeholder="z. B. 2" />
                  </label>
                  <label>
                    Skonto Tage
                    <input className="hbz-input" inputMode="numeric" value={selectedRow.billing.cashDiscountDays || ""} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, cashDiscountDays: e.target.value }))} onBlur={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, cashDiscountDays: formatCalculatedNumber(e.target.value, 0) }))} placeholder="z. B. 14 oder 7+7" />
                  </label>
                </div>
                <div className="billing-money-box deductions">
                  <div><span>Ausgangssumme netto</span><b>{fmtMoney(selectedRow.orderNetBeforeDiscount)}</b></div>
                  <div><span>Nachlass gesamt</span><b>{fmtMoney(selectedRow.discountAmount)}</b></div>
                  <div><span>Haftrücklass</span><b>{fmtMoney(selectedRow.retentionAmount)}</b></div>
                  <div><span>Deckungsrücklass</span><b>{fmtMoney(selectedRow.coverageRetentionAmount)}</b></div>
                  <div><span>Zahlbar nach Rücklässen</span><b>{fmtMoney(selectedRow.payableAfterRetentions)}</b></div>
                  <div><span>Skonto möglich</span><b>{fmtMoney(selectedRow.cashDiscountAmount)}</b></div>
                </div>
                <div className="billing-legal-note neutral">
                  Haftrücklass = Sicherstellung für Gewährleistung/Mängel nach Abnahme. Deckungsrücklass = Sicherstellung während der Bau-/Leistungsphase bis zur Abrechnung oder Abnahme.
                </div>
              </section>

              <section className="billing-form-card">
                <div className="billing-section-head invoices">
                  <div>
                    <h3>Regieberichte zur Abrechnung</h3>
                    <small>Unterschriebene Regieberichte erscheinen hier automatisch. Nach Aufnahme in eine Rechnung als verrechnet markieren.</small>
                  </div>
                  <span className="billing-regie-count">{selectedRow.regieBillableOpen.length} offen</span>
                </div>
                <div className="billing-regie-summary">
                  <div><span>Unterschrieben</span><b>{selectedRow.signedRegieReports.length}</b></div>
                  <div><span>Unverrechnet</span><b>{selectedRow.regieBillableOpen.length}</b></div>
                  <div><span>Stunden offen</span><b>{fmtRegieHours(selectedRow.regieBillableOpen.reduce((sum, report) => sum + report.hours, 0))}</b></div>
                </div>
                <div className="billing-regie-list">
                  {selectedRow.signedRegieReports.length === 0 ? <p className="billing-empty">Noch keine unterschriebenen Regieberichte für dieses Projekt.</p> : selectedRow.signedRegieReports.map((report) => (
                    <article className={`billing-regie-row ${report.billed ? "billed" : "open"}`} key={report.id}>
                      <div>
                        <b>{report.report_number || report.id}</b>
                        <small>{fmtDate(report.report_date)} · {fmtRegieHours(report.hours)}{report.materialCount ? ` · ${report.materialCount} Material/Geräte` : ""}</small>
                      </div>
                      <span className={`billing-regie-state ${report.billed ? "billed" : "open"}`}>{report.billed ? "verrechnet" : "offen"}</span>
                      <button className="hbz-btn btn-small" type="button" onClick={() => setRegieReportBilled(selectedRow, report.id, !report.billed)}>{report.billed ? "wieder offen" : "als verrechnet markieren"}</button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="billing-form-card">
                <div className="billing-section-head invoices"><h3>Nachträge / Zusatzaufträge</h3><button className="hbz-btn btn-small" type="button" onClick={() => addSupplement(selectedRow.project.id)}>+ Nachtrag</button></div>
                <div className="billing-lines">
                  {selectedRow.supplements.length === 0 ? <p className="billing-empty">Noch keine Nachträge erfasst.</p> : selectedRow.supplements.map((item) => (
                    <div className="billing-line" key={item.id}>
                      <input className="hbz-input" value={item.title || ""} onChange={(e) => updateListItem(selectedRow.project.id, "supplements", item.id, { title: e.target.value })} placeholder="Nachtrag" />
                      <input className="hbz-input" inputMode="decimal" value={item.net || ""} onChange={(e) => updateListItem(selectedRow.project.id, "supplements", item.id, { net: e.target.value })} onBlur={(e) => updateListItem(selectedRow.project.id, "supplements", item.id, { net: formatCalculatedNumber(e.target.value) })} placeholder="Netto, z. B. 1000+250" />
                      <select className="hbz-input" value={item.status || "Offen"} onChange={(e) => updateListItem(selectedRow.project.id, "supplements", item.id, { status: e.target.value })}><option>Offen</option><option>Freigegeben</option><option>Abgerechnet</option><option>Storniert</option></select>
                      <button className="hbz-btn btn-small" type="button" onClick={() => removeListItem(selectedRow.project.id, "supplements", item.id)}>Löschen</button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="billing-form-card">
                <div className="billing-section-head invoices"><h3>Teilrechnungen</h3><button className="hbz-btn btn-small" type="button" onClick={() => addInvoice(selectedRow)}>+ Teilrechnung</button></div>
                <div className="billing-lines">
                  {selectedRow.invoices.length === 0 ? <p className="billing-empty">Noch keine Teilrechnung erfasst.</p> : selectedRow.invoices.map((item) => (
                    <div className="billing-line invoice" key={item.id}>
                      <input className="hbz-input" value={item.invoiceNumber || ""} onChange={(e) => updateListItem(selectedRow.project.id, "invoices", item.id, { invoiceNumber: e.target.value })} placeholder="Rechnungsnr." />
                      <input className="hbz-input" type="date" value={item.date || ""} onChange={(e) => updateListItem(selectedRow.project.id, "invoices", item.id, { date: e.target.value })} />
                      <input className="hbz-input" value={item.title || ""} onChange={(e) => updateListItem(selectedRow.project.id, "invoices", item.id, { title: e.target.value })} placeholder="Bezeichnung" />
                      <input className="hbz-input" value={item.period || ""} onChange={(e) => updateListItem(selectedRow.project.id, "invoices", item.id, { period: e.target.value })} placeholder="Leistungszeitraum" />
                      <input className="hbz-input" inputMode="decimal" value={item.net || ""} onChange={(e) => updateListItem(selectedRow.project.id, "invoices", item.id, { net: e.target.value })} onBlur={(e) => updateListItem(selectedRow.project.id, "invoices", item.id, { net: formatCalculatedNumber(e.target.value) })} placeholder="Netto, z. B. 5000+2500" />
                      <select className="hbz-input" value={item.status || "Entwurf"} onChange={(e) => updateListItem(selectedRow.project.id, "invoices", item.id, { status: e.target.value })}><option>Entwurf</option><option>Gesendet</option><option>Bezahlt</option><option>Storniert</option></select>
                      <input className="hbz-input" type="date" value={item.paidAt || ""} onChange={(e) => updateListItem(selectedRow.project.id, "invoices", item.id, { paidAt: e.target.value })} />
                      <button className="hbz-btn btn-small" type="button" onClick={() => removeListItem(selectedRow.project.id, "invoices", item.id)}>Löschen</button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="billing-form-card">
                <div className="billing-section-head invoices">
                  <div>
                    <h3>AG-Abzüge</h3>
                    <small>Hier dokumentieren, wenn der Auftraggeber etwas abgezogen oder gekürzt hat.</small>
                  </div>
                  <button className="hbz-btn btn-small" type="button" onClick={() => addClientDeduction(selectedRow.project.id)}>+ AG-Abzug</button>
                </div>
                <div className="billing-money-box client-deductions">
                  <div><span>AG-Abzüge gesamt</span><b>{fmtMoney(selectedRow.clientDeductionNet)}</b></div>
                  <div><span>Offener Rest nach AG-Abzug</span><b>{fmtMoney(selectedRow.remainingNet)}</b></div>
                </div>
                <div className="billing-lines">
                  {selectedRow.clientDeductions.length === 0 ? <p className="billing-empty">Noch kein AG-Abzug erfasst.</p> : selectedRow.clientDeductions.map((item) => (
                    <div className="billing-line client-deduction" key={item.id}>
                      <input className="hbz-input" type="date" value={item.date || ""} onChange={(e) => updateListItem(selectedRow.project.id, "clientDeductions", item.id, { date: e.target.value })} />
                      <select className="hbz-input" value={item.reason || ""} onChange={(e) => updateListItem(selectedRow.project.id, "clientDeductions", item.id, { reason: e.target.value })}>
                        <option value="">Grund auswählen</option>
                        <option>Mängel / Gewährleistung</option>
                        <option>Baureinigung</option>
                        <option>Preisminderung</option>
                        <option>Gegenverrechnung</option>
                        <option>sonstiger AG-Abzug</option>
                      </select>
                      <input className="hbz-input" inputMode="decimal" value={item.net || ""} onChange={(e) => updateListItem(selectedRow.project.id, "clientDeductions", item.id, { net: e.target.value })} onBlur={(e) => updateListItem(selectedRow.project.id, "clientDeductions", item.id, { net: formatCalculatedNumber(e.target.value) })} placeholder="Betrag netto, z. B. 300+50" />
                      <select className="hbz-input" value={item.status || "Offen"} onChange={(e) => updateListItem(selectedRow.project.id, "clientDeductions", item.id, { status: e.target.value })}>
                        <option>Offen</option>
                        <option>Akzeptiert</option>
                        <option>Einspruch</option>
                        <option>Geklärt</option>
                        <option>Storniert</option>
                      </select>
                      <input className="hbz-input" value={item.note || ""} onChange={(e) => updateListItem(selectedRow.project.id, "clientDeductions", item.id, { note: e.target.value })} placeholder="Notiz / Beleg" />
                      <button className="hbz-btn btn-small" type="button" onClick={() => removeListItem(selectedRow.project.id, "clientDeductions", item.id)}>Löschen</button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>

        <aside className="hbz-card billing-check-panel">
          {!selectedRow ? null : (
            <>
              <div className="billing-section-head"><div><div className="eyebrow">Prüfung</div><h2>Nächste Schritte</h2></div><strong className="billing-score">{selectedRow.readyScore}%</strong></div>
              <div className="billing-checklist">
                {selectedRow.checks.map((check) => <div className={`billing-check-row ${check.ok ? "ok" : "warn"}`} key={check.key}><span>{check.ok ? "✓" : "!"}</span><b>{check.label}</b></div>)}
              </div>
              <div className="billing-side-box">
                <h3>Dokumentation</h3>
                <p><b>Regieberichte:</b> {selectedRow.regieSigned} fertig / {selectedRow.regieOpen} offen</p>
                <p><b>Unverrechnet:</b> {selectedRow.regieBillableOpen.length} Regiebericht{selectedRow.regieBillableOpen.length === 1 ? "" : "e"}</p>
                <p><b>Bautagesberichte:</b> {selectedRow.dailyDone} fertig / {selectedRow.dailyDraft} Entwurf</p>
                <p><b>Zeiten:</b> {selectedRow.entries} Einträge an {selectedRow.days.size} Tagen</p>
                <p><b>AG-Abzüge:</b> {fmtMoney(selectedRow.clientDeductionNet)}</p>
              </div>
              <div className="billing-side-box">
                <h3>Änderungsverlauf</h3>
                {(auditByProject[String(selectedRow.project.id)] || []).slice(0, 5).length === 0 ? (
                  <p>Noch kein Verlauf gespeichert.</p>
                ) : (
                  (auditByProject[String(selectedRow.project.id)] || []).slice(0, 5).map((row) => (
                    <p key={row.id}><b>{row.action}</b><br />{new Date(row.changed_at).toLocaleString("de-AT")} {row.changed_by_name ? `· ${row.changed_by_name}` : ""}</p>
                  ))
                )}
              </div>
              <label>Nächste Aktion<input className="hbz-input" value={selectedRow.billing.nextAction || ""} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, nextAction: e.target.value }))} placeholder="z. B. 1. Teilrechnung prüfen" /></label>
              <label>Abrechnungsnotiz<textarea className="hbz-textarea" value={selectedRow.billing.note || ""} onChange={(e) => updateBilling(selectedRow.project.id, (current) => ({ ...current, note: e.target.value }))} placeholder="Offene Punkte, Vereinbarung, Schlussrechnung…" /></label>
            </>
          )}
        </aside>
      </div>

      <style>{`
        .billing-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;padding:30px 22px;border-radius:24px;color:#fff;background:linear-gradient(135deg,#684027,#b88555);box-shadow:0 18px 42px rgba(71,45,26,.14);overflow:hidden;position:relative}.billing-hero:after{content:"";position:absolute;right:-40px;top:-60px;width:230px;height:230px;border-radius:50%;background:rgba(255,255,255,.12)}.billing-hero h1{margin:2px 0 6px;font-size:34px;letter-spacing:-.04em}.billing-hero p{margin:0;color:rgba(255,255,255,.84)}.billing-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.billing-summary-card{padding:16px;border:1px solid var(--hbz-border);border-radius:18px;background:rgba(255,252,247,.92);box-shadow:var(--hbz-shadow-sm)}.billing-summary-card span,.billing-summary-card small{display:block;color:#776252}.billing-summary-card strong{display:block;margin:5px 0;font-size:25px;color:#352419}.billing-archive-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.billing-archive-tab{border:1px solid rgba(123,74,45,.2);border-radius:999px;background:#fffaf4;color:#5a3a23;padding:8px 12px;font-weight:900;cursor:pointer}.billing-archive-tab.active{background:#7b4a2d;color:#fff;box-shadow:0 8px 18px rgba(71,45,26,.14)}.billing-archive-tab span{display:inline-flex;margin-left:6px;min-width:24px;justify-content:center;border-radius:999px;background:rgba(255,255,255,.24);padding:2px 7px}.billing-filter-grid{display:grid;grid-template-columns:150px 150px 190px 190px minmax(220px,1fr);gap:12px}.billing-filter-grid label,.billing-check-panel label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:850;color:#5a3a23}.billing-workspace{display:grid;grid-template-columns:260px minmax(0,1fr) 300px;gap:14px;align-items:start}.billing-project-list,.billing-check-panel{position:sticky;top:98px}.billing-section-head,.billing-file-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.billing-section-head h2,.billing-section-head h3,.billing-file-head h2{margin:0;color:#372519}.billing-file-head p{margin:4px 0 0;color:#776252}.billing-project-items{display:grid;gap:8px;max-height:710px;overflow:auto;padding-right:3px}.billing-project-item{border:1px solid rgba(142,103,70,.18);border-radius:14px;background:#fffaf4;padding:10px;text-align:left;display:grid;gap:4px;cursor:pointer}.billing-project-item.active,.billing-project-item:hover{border-color:#7b4a2d;background:#fff2df}.billing-project-item b,.billing-project-item small,.billing-project-item em{display:block}.billing-project-item em{font-style:normal;font-weight:900;color:#4d3120}.billing-archive-hint{margin:0 0 10px;color:#776252;font-size:12px;line-height:1.4}.billing-empty-box{padding:12px;border:1px dashed rgba(123,74,45,.25);border-radius:14px;background:#fffaf4;color:#776252;font-size:13px}.billing-status{display:inline-flex;width:max-content;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900}.billing-status.missing{background:#fff0df;color:#98520b}.billing-status.open{background:#eef5ff;color:#295a8f}.billing-status.ready{background:#eaf7ec;color:#2f6e3d}.billing-status.partial{background:#fff5d8;color:#7d5700}.billing-status.done{background:#e7f6eb;color:#246a36}.billing-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.billing-workflow{width:auto;min-width:190px}.billing-project-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.billing-project-meta div,.billing-money-box div{padding:10px;border:1px solid rgba(142,103,70,.18);border-radius:13px;background:#fff8ef}.billing-project-meta span,.billing-project-meta b,.billing-money-box span,.billing-money-box b{display:block}.billing-project-meta span,.billing-money-box span{font-size:11px;color:#7a6656}.billing-project-meta b{font-size:13px}.billing-progress-card,.billing-form-card,.billing-side-box{border:1px solid rgba(142,103,70,.16);border-radius:16px;background:rgba(255,250,244,.86);padding:14px;margin-bottom:12px}.billing-progress-top,.billing-progress-legend{display:flex;justify-content:space-between;gap:12px}.billing-progress-top span,.billing-progress-legend{color:#7a6656;font-size:12px}.billing-progress-top strong{display:block;font-size:24px}.billing-progress-track{height:13px;margin:12px 0;border-radius:999px;background:#ead8c2;overflow:hidden}.billing-progress-track span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#7b4a2d,#c89154)}.billing-editor-grid{display:grid;grid-template-columns:1fr 120px;gap:10px}.billing-deduction-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px}.billing-form-card label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:850;color:#5a3a23}.billing-check{margin:12px 0;flex-direction:row!important;align-items:center!important}.billing-check input{width:17px;height:17px;accent-color:#7b4a2d}.billing-money-box{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.billing-money-box.deductions{grid-template-columns:repeat(3,minmax(0,1fr))}.billing-money-box b{font-size:16px}.billing-legal-note{margin-top:10px;padding:10px;border-radius:13px;background:#eef6ff;color:#245278;font-size:12px;font-weight:800}.billing-legal-note.neutral{background:#fff4df;color:#6f4b1f}.billing-lines{display:grid;gap:8px}.billing-line{display:grid;grid-template-columns:minmax(160px,1fr) 110px 120px auto;gap:7px;align-items:center}.billing-line.invoice{grid-template-columns:105px 120px minmax(130px,1fr) minmax(145px,1fr) 100px 105px 120px auto}.billing-line.client-deduction{grid-template-columns:120px minmax(150px,1fr) 110px 120px minmax(140px,1fr) auto}.billing-regie-count{display:inline-flex;align-items:center;border-radius:999px;background:#fff2df;color:#7b4a2d;padding:6px 10px;font-size:12px;font-weight:900}.billing-regie-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.billing-regie-summary div{padding:10px;border:1px solid rgba(142,103,70,.18);border-radius:13px;background:#fff8ef}.billing-regie-summary span,.billing-regie-summary b{display:block}.billing-regie-summary span{font-size:11px;color:#7a6656}.billing-regie-summary b{font-size:16px}.billing-regie-list{display:grid;gap:8px}.billing-regie-row{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:10px;align-items:center;padding:10px;border:1px solid rgba(142,103,70,.16);border-radius:14px;background:#fffaf4}.billing-regie-row.billed{background:#f3faf4}.billing-regie-row b,.billing-regie-row small{display:block}.billing-regie-row small{margin-top:3px;color:#776252}.billing-regie-state{border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900}.billing-regie-state.open{background:#fff0df;color:#98520b}.billing-regie-state.billed{background:#e7f6eb;color:#246a36}.billing-empty{margin:0;color:#7c6b5d;font-size:13px}.billing-score{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:#fff2df;color:#7b4a2d}.billing-checklist{display:grid;gap:7px;margin-bottom:12px}.billing-check-row{display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:center;padding:9px;border-radius:12px;background:#fffaf4}.billing-check-row span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;font-weight:900}.billing-check-row.ok span{background:#e7f6eb;color:#246a36}.billing-check-row.warn span{background:#fff0df;color:#98520b}.billing-side-box p{margin:7px 0;color:#5d4d41}@media(max-width:1180px){.billing-workspace{grid-template-columns:240px minmax(0,1fr)}.billing-check-panel{position:static;grid-column:1 / -1}.billing-summary-grid,.billing-project-meta,.billing-money-box,.billing-money-box.deductions{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:900px){.billing-workspace,.billing-filter-grid{grid-template-columns:1fr}.billing-project-list{position:static}.billing-project-items{max-height:none}.billing-line,.billing-line.invoice,.billing-line.client-deduction,.billing-editor-grid,.billing-deduction-grid,.billing-regie-row{grid-template-columns:1fr}}@media(max-width:680px){.billing-hero{align-items:stretch;flex-direction:column;padding:22px 16px}.billing-hero h1{font-size:28px}.billing-summary-grid,.billing-project-meta,.billing-money-box,.billing-money-box.deductions{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
