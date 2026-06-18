export function getAssignmentProjects({ assignments = [], date, projects = [] }) {
  const projectById = new Map(projects.map((project) => [String(project.id), project]));
  const seen = new Set();

  return assignments
    .filter((row) => row.assignment_date === date && row.project_id != null)
    .reduce((result, row) => {
      const nestedProject = row.projects || null;
      const id = nestedProject?.id ?? row.project_id;
      const key = String(id);
      if (seen.has(key)) return result;

      seen.add(key);
      const fallbackProject = projectById.get(key);
      result.push({
        id,
        name: nestedProject?.name || fallbackProject?.name || `Projekt ${id}`,
        code: nestedProject?.code || fallbackProject?.code || "",
      });
      return result;
    }, []);
}

export function getAssignedEmployeeCodes({
  assignments = [],
  date,
  projectId,
  employees = [],
}) {
  if (!date || projectId == null || projectId === "") return [];

  const codeByEmployeeId = new Map(
    employees
      .filter((employee) => employee?.active !== false && employee?.disabled !== true)
      .map((employee) => [String(employee.id), employee.code])
  );

  return assignments
    .filter(
      (row) =>
        row.assignment_date === date &&
        String(row.project_id ?? row.projects?.id ?? "") === String(projectId)
    )
    .map((row) => codeByEmployeeId.get(String(row.employee_id)))
    .filter((code, index, codes) => code && codes.indexOf(code) === index);
}

export function getDefaultAssignmentProjectId({
  assignments = [],
  date,
  currentEmployeeId,
  isManager,
}) {
  const dayAssignments = assignments.filter(
    (row) => row.assignment_date === date && row.project_id != null
  );
  if (isManager) return dayAssignments[0]?.project_id ?? null;
  if (currentEmployeeId == null) return null;

  return (
    dayAssignments.find(
      (row) => String(row.employee_id) === String(currentEmployeeId)
    )?.project_id ?? null
  );
}
