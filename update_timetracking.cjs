const fs = require("fs");

const file = "src/components/TimeTracking.jsx";

if (!fs.existsSync(file)) {
  console.error("Datei nicht gefunden:", file);
  process.exit(1);
}

let content = fs.readFileSync(file, "utf8");

// Backup
const backup = file + ".backup_mitarbeiter_nur_sich";
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, content, "utf8");
}

// 1) Helper einfügen: Mitarbeiter sieht nur sich selbst
if (!content.includes("visibleTrackingEmployees")) {
  content = content.replace(
    /const\s+isStaff\s*=\s*[^;]+;/,
    (match) => `${match}

  const visibleTrackingEmployees = useMemo(() => {
    if (!isStaff) return employees;
    return employees.filter((e) => e.code === session?.code);
  }, [employees, isStaff, session?.code]);`
  );
}

// Falls isStaff noch nicht existiert
if (!content.includes("const visibleTrackingEmployees")) {
  content = content.replace(
    /const\s+role\s*=\s*[^;]+;/,
    (match) => `${match}
  const isStaff = role === "mitarbeiter";

  const visibleTrackingEmployees = useMemo(() => {
    if (!isStaff) return employees;
    return employees.filter((e) => e.code === session?.code);
  }, [employees, isStaff, session?.code]);`
  );
}

// 2) Alle Mitarbeiter-Maps in der Zeiterfassung auf sichtbare Mitarbeiter umstellen
content = content.replace(/employees\.map\(/g, "visibleTrackingEmployees.map(");

// 3) EmployeePicker falls vorhanden umstellen
content = content.replace(/employees=\{employees\}/g, "employees={visibleTrackingEmployees}");

// 4) Auswahl für Mitarbeiter automatisch auf sich selbst setzen
if (!content.includes("MITARBEITER_ONLY_SELF_SELECTION")) {
  content = content.replace(
    /useEffect\(\(\)\s*=>\s*\{/,
    `useEffect(() => {
    // MITARBEITER_ONLY_SELF_SELECTION
    if (isStaff && session?.code) {
      setSelectedCodes([session.code]);
    }
  }, [isStaff, session?.code]);

  useEffect(() => {`
  );
}

// 5) Alle/Keine Buttons für Mitarbeiter ausblenden
content = content.replace(
  /(<button[^>]*>\s*Alle\s*<\/button>\s*<button[^>]*>\s*Keine\s*<\/button>)/g,
  `{!isStaff && (
    <>
      $1
    </>
  )}`
);

// 6) Chips für Mitarbeiter blockieren: Mitarbeiter kann nicht andere auswählen
content = content.replace(
  /onClick=\{\(\)\s*=>\s*\{/g,
  `onClick={() => {
    if (isStaff) return;`
);

// 7) Tageskontrolle oben ebenfalls nur eigener MA
content = content.replace(/activeEmployees\.map\(/g, "visibleTrackingEmployees.map(");

fs.writeFileSync(file, content, "utf8");

console.log("✅ TimeTracking angepasst:", file);
console.log("Backup:", backup);