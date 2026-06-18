export function getUserPermissions(user) {
  const role = user?.role || "mitarbeiter";
  const permissions = user?.permissions || {};

  const roleDefaults = {
    admin: {
      writeOwnTime: true,
      writeAllTime: true,
      editOwnTime: true,
      editAllTime: true,
      deleteOwnTime: true,
      deleteAllTime: true,
      viewAssignments: true,
      manageAssignments: true,
      viewMonthlyOverview: true,
      viewYearOverview: true,
      manageProjects: true,
      manageEmployees: true,
    },
    teamleiter: {
      writeOwnTime: true,
      writeAllTime: true,
      editOwnTime: true,
      editAllTime: true,
      deleteOwnTime: true,
      deleteAllTime: true,
      viewAssignments: true,
      manageAssignments: true,
      viewMonthlyOverview: true,
      viewYearOverview: false,
      manageProjects: false,
      manageEmployees: false,
    },
    buchhaltung: {
      writeOwnTime: false,
      writeAllTime: false,
      editOwnTime: false,
      editAllTime: false,
      deleteOwnTime: false,
      deleteAllTime: false,
      viewAssignments: true,
      manageAssignments: false,
      viewMonthlyOverview: true,
      viewYearOverview: true,
      manageProjects: false,
      manageEmployees: false,
    },
    mitarbeiter: {
      writeOwnTime: true,
      writeAllTime: false,
      editOwnTime: true,
      editAllTime: false,
      deleteOwnTime: false,
      deleteAllTime: false,
      viewAssignments: false,
      manageAssignments: false,
      viewMonthlyOverview: false,
      viewYearOverview: false,
      manageProjects: false,
      manageEmployees: false,
    },
  };

  return {
    ...(roleDefaults[role] || roleDefaults.mitarbeiter),
    ...permissions,
  };
}

export function hasPermission(user, permission) {
  const allPermissions = getUserPermissions(user);
  return !!allPermissions?.[permission];
}

export function canEditTimeEntry({
  entry,
  currentEmployeeId,
  isManager,
  canEditOwnTime,
}) {
  if (!entry) return false;
  if (isManager) return true;
  if (!canEditOwnTime || currentEmployeeId == null) return false;
  return String(entry.employee_id ?? "") === String(currentEmployeeId);
}
