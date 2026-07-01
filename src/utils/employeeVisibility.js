export function isAdminRole(role) {
  return String(role || "").trim().toLowerCase() === "admin";
}

export function isTestEmployee(employee) {
  return employee?.is_test_employee === true;
}

function sameEmployeeIdentity(employee, currentUser) {
  if (!employee || !currentUser) return false;
  if (currentUser.id != null && String(employee.id) === String(currentUser.id)) return true;
  const employeeCode = String(employee.code || "").trim().toLowerCase();
  const userCode = String(currentUser.code || "").trim().toLowerCase();
  return !!employeeCode && employeeCode === userCode;
}

export function filterVisibleEmployeesForRole(employees = [], role = "mitarbeiter", currentUser = null) {
  const list = employees || [];
  if (isAdminRole(role)) return list;
  return list.filter((employee) => !isTestEmployee(employee) || sameEmployeeIdentity(employee, currentUser));
}
