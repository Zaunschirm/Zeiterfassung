export function createReportNumber(dateValue = new Date(), randomValue = Math.random()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  const suffix = Math.floor(Number(randomValue || 0) * 1000).toString().padStart(3, "0");
  return `RB-${stamp}-${suffix}`;
}
export function cleanLaborItems(items = []) {
  return items.map((item) => ({ employee_id: item?.employee_id ? String(item.employee_id) : "", name: String(item?.name || "").trim(), hours: Math.max(0, Number(item?.hours || 0)), activity: String(item?.activity || "").trim() })).filter((item) => item.name && item.hours > 0);
}
export function cleanMaterialItems(items = []) {
  return items.map((item) => ({ description: String(item?.description || "").trim(), quantity: Math.max(0, Number(item?.quantity || 0)), unit: String(item?.unit || "Stk.").trim() || "Stk." })).filter((item) => item.description && item.quantity > 0);
}
export const sumLaborHours = (items = []) => cleanLaborItems(items).reduce((sum, item) => sum + item.hours, 0);
