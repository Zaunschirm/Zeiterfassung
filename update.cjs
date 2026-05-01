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

function patchTimeTrackingOnlySelf(file) {
  const fs = require("fs");

  if (!fs.existsSync(file)) {
    console.error("Datei nicht gefunden:", file);
    return;
  }

  let content = fs.readFileSync(file, "utf8");

  // Backup erstellen
  const backup = file + ".backup_only_self";
  if (!fs.existsSync(backup)) {
    fs.writeFileSync(backup, content, "utf8");
  }

  // Mitarbeiterliste im Picker auf angemeldeten Mitarbeiter begrenzen
  content = content.replace(
    /<EmployeePicker\s+([^>]*?)employees=\{employees\}([^>]*?)\/>/gs,
    `<EmployeePicker
        $1
        employees={
          role === "mitarbeiter"
            ? employees.filter((e) => e.code === session?.code)
            : employees
        }
        $2
      />`
  );

  // Falls direkt employees.map verwendet wird: nur eigene Person anzeigen
  content = content.replace(
    /employees\.map\(\(e\) =>/g,
    `(role === "mitarbeiter" ? employees.filter((e) => e.code === session?.code) : employees).map((e) =>`
  );

  // Alle/Keine Buttons für Mitarbeiter ausblenden
  content = content.replace(
    /(\{\/\*\s*Mitarbeiter\s*\*\/\}[\s\S]*?)(<button[\s\S]*?>Alle<\/button>[\s\S]*?<button[\s\S]*?>Keine<\/button>)/g,
    `$1{role !== "mitarbeiter" && (
        <>
          $2
        </>
      )}`
  );

  fs.writeFileSync(file, content, "utf8");
  console.log("Zeiterfassung angepasst:", file);
}

patchTimeTrackingOnlySelf("src/components/TimeTracking.jsx");// ===============================
// 🔥 TIMETRACKING FIX (nur 1 Datei!)
// ===============================
function patchTimeTracking(file) {
  const fs = require("fs");

  if (!fs.existsSync(file)) {
    console.error("Datei nicht gefunden:", file);
    return;
  }

  let content = fs.readFileSync(file, "utf8");

  // Backup
  const backup = file + ".backup";
  if (!fs.existsSync(backup)) {
    fs.writeFileSync(backup, content, "utf8");
  }

  // isStaff sicherstellen
  if (!content.includes("const isStaff")) {
    content = content.replace(
      /const\s+role\s*=\s*[^;]+;/,
      (m) => `${m}\nconst isStaff = role === "mitarbeiter";`
    );
  }

  // Sichtbare Mitarbeiter definieren
  if (!content.includes("visibleTrackingEmployees")) {
    content = content.replace(
      /const\s+\[employees[^\]]+\]\s*=\s*useState\([^\)]*\);/,
      (m) => `${m}

const visibleTrackingEmployees = useMemo(() => {
  if (!isStaff) return employees;
  return employees.filter((e) => e.code === session?.code);
}, [employees, isStaff, session?.code]);`
    );
  }

  // Alle Mitarbeiter-Renderings ersetzen
  content = content.replace(/employees\.map\(/g, "visibleTrackingEmployees.map(");

  // Tageskontrolle oben fixen
  content = content.replace(/activeEmployees\.map\(/g, "visibleTrackingEmployees.map(");

  // EmployeePicker fixen
  content = content.replace(/employees=\{employees\}/g, "employees={visibleTrackingEmployees}");

  // Automatisch sich selbst setzen
  if (!content.includes("AUTO_SELF_SELECT")) {
    content = content.replace(
      /useEffect\(\(\)\s*=>\s*\{/,
      `useEffect(() => {
  // AUTO_SELF_SELECT
  if (isStaff && session?.code) {
    setSelectedCodes([session.code]);
  }
}, [isStaff, session?.code]);

useEffect(() => {`
    );
  }

  // Alle/Keine ausblenden
  content = content.replace(
    /<button[^>]*>\s*Alle\s*<\/button>\s*<button[^>]*>\s*Keine\s*<\/button>/g,
    `{!isStaff && (
      <>
        <button>Alle</button>
        <button>Keine</button>
      </>
    )}`
  );

  // Klicks blockieren
  content = content.replace(
    /onClick=\{\(\)\s*=>\s*\{/g,
    `onClick={() => {
      if (isStaff) return;`
  );

  fs.writeFileSync(file, content, "utf8");

  console.log("✅ TimeTracking angepasst:", file);
}

// 🔥 AUSFÜHREN
patchTimeTracking("src/components/TimeTracking.jsx");