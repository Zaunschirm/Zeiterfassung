const fs = require("fs");

function updateFile(file) {
  if (!fs.existsSync(file)) {
    console.error("Datei nicht gefunden:", file);
    return;
  }

  let content = fs.readFileSync(file, "utf8");

  if (!content.includes("showInactiveEmployees")) {
    content = content.replace(
      'const [selectedProjectId, setSelectedProjectId] = useState("");',
      `const [selectedProjectId, setSelectedProjectId] = useState("");

  const [showInactiveEmployees, setShowInactiveEmployees] = useState(false);`
    );
  }

  if (!content.includes("employeesWithData")) {
    content = content.replace(
      "const selectedEmployees = useMemo(",
      `
  const employeesWithData = useMemo(() => {
    const ids = new Set(rows.map((r) => r.employee_id));
    return employees.filter((e) => ids.has(e.id));
  }, [rows, employees]);

  const visibleEmployees = useMemo(() => {
    if (showInactiveEmployees) return employees;
    return employees.filter((e) => e.active !== false && e.disabled !== true);
  }, [employees, showInactiveEmployees]);

  const finalEmployees = useMemo(() => {
    const map = new Map();
    visibleEmployees.forEach((e) => map.set(e.id, e));
    employeesWithData.forEach((e) => map.set(e.id, e));
    return Array.from(map.values());
  }, [visibleEmployees, employeesWithData]);

  const selectedEmployees = useMemo(`
    );
  }

  content = content.replace(/employees\.map\(\(e\) => e\.code\)/g, "finalEmployees.map((e) => e.code)");
  content = content.replace(/employees\.map\(\(e\)/g, "finalEmployees.map((e)");

  content = content.replace(
    /ids = employees\s*\.filter\(\(e\) => selectedCodes\.includes\(e\.code\)\)\s*\.map\(\(e\) => e\.id\);/g,
    `ids = finalEmployees
          .filter((e) => selectedCodes.includes(e.code))
          .map((e) => e.id);`
  );

  if (!content.includes("Deaktivierte Mitarbeiter anzeigen")) {
    content = content.replace(
      '<div className="month-employee-head">',
      `<label className="month-check-row" style={{ marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={showInactiveEmployees}
                  onChange={(e) => setShowInactiveEmployees(e.target.checked)}
                />
                <span>Deaktivierte Mitarbeiter anzeigen</span>
              </label>

              <div className="month-employee-head">`
    );
  }

  fs.writeFileSync(file, content, "utf8");
  console.log("Aktualisiert:", file);
}

updateFile("src/components/MonthlyOverview.jsx");
updateFile("src/components/YearOverview.jsx");

console.log("FERTIG ✅");
function patchTimeTracking(file) {
  const fs = require("fs");

  if (!fs.existsSync(file)) {
    console.error("Datei nicht gefunden:", file);
    return;
  }

  let content = fs.readFileSync(file, "utf8");

  // Mitarbeiter nur sich selbst
  if (!content.includes("ONLY_SELF_MODE")) {
    content = content.replace(
      "const session",
      `const session

  const isStaff = (session?.role || "").toLowerCase() === "mitarbeiter";`
    );

    content = content.replace(
      "setSelectedEmployee(",
      `if (isStaff) return;
      setSelectedEmployee(`
    );
  }

  // Hinweis wenn kein Eintrag
  if (!content.includes("Noch kein Eintrag")) {
    content = content.replace(
      "return (",
      `
  const hasEntryToday = entries?.some(
    (e) => e.work_date === new Date().toISOString().slice(0, 10)
  );

  return (
    <>
      {isStaff && !hasEntryToday && (
        <div style={{
          background: "#fff3cd",
          padding: "10px",
          borderRadius: "6px",
          marginBottom: "10px"
        }}>
          ⚠️ Noch kein Eintrag für heute vorhanden
        </div>
      )}
    `
    );
  }

  fs.writeFileSync(file, content, "utf8");
  console.log("TimeTracking angepasst:", file);
}
patchTimeTracking("src/components/TimeTracking.jsx");