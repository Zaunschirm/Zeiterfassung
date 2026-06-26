export function isAdminRole(role) {
  return String(role || "").trim().toLowerCase() === "admin";
}

export function isTestEmployee(employee) {
  return employee?.is_test_employee === true;
}

export function filterVisibleEmployeesForRole(employees = [], role = "mitarbeiter") {
  const list = employees || [];
  if (isAdminRole(role)) return list;
  return list.filter((employee) => !isTestEmployee(employee));
}

