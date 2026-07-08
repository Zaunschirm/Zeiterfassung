import { parseCalculatedNumber } from "./calculatedInput";

export function createReportNumber(projectName = "Projekt", dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const project = String(projectName || "Projekt")
    .trim()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "Projekt";
  return `RB-${project}-${stamp}`;
}
export function cleanLaborItems(items = []) {
  return items.map((item) => ({ employee_id: item?.employee_id ? String(item.employee_id) : "", name: String(item?.name || "").trim(), hours: Math.max(0, parseCalculatedNumber(item?.hours, 0)), activity: String(item?.activity || "").trim() })).filter((item) => item.name && item.hours > 0);
}
export function prepareLaborItems(items = []) {
  return items.map((item) => ({ employee_id: item?.employee_id ? String(item.employee_id) : "", name: String(item?.name || "").trim(), hours: Math.max(0, parseCalculatedNumber(item?.hours, 0)), activity: String(item?.activity || "").trim() })).filter((item) => item.name);
}
export function cleanMaterialItems(items = []) {
  return items.map((item) => ({ description: String(item?.description || "").trim(), quantity: Math.max(0, parseCalculatedNumber(item?.quantity, 0)), unit: String(item?.unit || "Stk.").trim() || "Stk." })).filter((item) => item.description && item.quantity > 0);
}
export function prepareMaterialItems(items = []) {
  return items.map((item) => ({ description: String(item?.description || "").trim(), quantity: Math.max(0, parseCalculatedNumber(item?.quantity, 0)), unit: String(item?.unit || "Stk.").trim() || "Stk." })).filter((item) => item.description);
}
export const sumLaborHours = (items = []) => cleanLaborItems(items).reduce((sum, item) => sum + item.hours, 0);
