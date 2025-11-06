import { useEffect, useState } from "react";
import supabase from "../lib/supabase";
import { getISOWeek } from "date-fns";

export default function Monatsuebersicht({ session }) {
  const [rows, setRows] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState(null);

  // Nur Admin darf rein
  if (session.role !== "admin") {
    return <div className="p-4 text-red-700">Nur Administratoren dürfen diese Seite sehen.</div>;
  }

  // Mitarbeiterauswahl laden
  useEffect(() => {
    async function loadEmployees() {
      const { data, error } = await supabase
       .from("employees").select("id, name").eq("disabled", false).order("name")
      if (!error) setEmployees(data || []);
    }
    loadEmployees();
  }, []);

  // Daten laden
  useEffect(() => {
    async function loadMonth() {
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const to = `${year}-${String(month).padStart(2, "0")}-31`;
      let query = supabase
       .from("eintraege")
        .order("datum", { ascending: true });
      if (employeeId) query = query.eq("employee_id", employeeId);

      const { data, error } = await query;
      if (!error) setRows(data || []);
    }
    loadMonth();
  }, [month, year, employeeId]);

  // Hilfsfunktionen
  const minutesToLabel = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}h`;
  };
  const dayNet = (r) => Math.max(0, (r.end_min - r.start_min) - (r.pause_min || 0));
  const dayDiff = (r) => dayNet(r) - 540; // +/- zu 9h

  // Gruppierung nach Woche
  const weeks = new Map();
  let monthSum = 0, overSum = 0, underSum = 0;

  rows.forEach(r => {
    const week = getISOWeek(new Date(r.datum_date));
    const net = dayNet(r);
    const diff = dayDiff(r);
    if (!weeks.has(week)) weeks.set(week, { rows: [], sum: 0, over: 0, under: 0 });
    const b = weeks.get(week);
    b.rows.push(r);
    b.sum += net;
    if (diff >= 0) b.over += diff; else b.under += Math.abs(diff);
    monthSum += net;
    if (diff >= 0) overSum += diff; else underSum += Math.abs(diff);
  });

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Monatsübersicht</h2>

      <div className="flex gap-3 mb-4">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {[...Array(12)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(0, i).toLocaleString("de-DE", { month: "long" })}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border rounded px-2 w-20"
        />

        <select
          value={employeeId || ""}
          onChange={(e) => setEmployeeId(e.target.value || null)}
        >
          <option value="">Alle Mitarbeiter</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {[...weeks.entries()].map(([week, data]) => (
        <div key={week} className="mb-6 bg-white rounded-xl shadow p-3">
          <h3 className="font-semibold mb-2">Kalenderwoche {week}</h3>
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th>Datum</th>
                <th>Mitarbeiter</th>
                <th>Projekt</th>
                <th>Start</th>
                <th>Ende</th>
                <th>Pause</th>
                <th>Arbeitszeit</th>
                <th>+/– Stunden</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td>{new Date(r.datum_date).toLocaleDateString("de-DE")}</td>
                  <td>{(employees.find(e => e.id === r.employee_id)?.name || "") || ""}</td>
                  <td>{r.proj?.name || ""}</td>
                  <td>{minutesToLabel(r.start_min)}</td>
                  <td>{minutesToLabel(r.end_min)}</td>
                  <td>{minutesToLabel(r.pause_min)}</td>
                  <td>{minutesToLabel(dayNet(r))}</td>
                  <td className={dayDiff(r) >= 0 ? "text-green-600" : "text-red-600"}>
                    {dayDiff(r) >= 0
                      ? "+" + minutesToLabel(dayDiff(r))
                      : "-" + minutesToLabel(Math.abs(dayDiff(r)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-2 text-sm text-right">
            <b>Wochensumme:</b> {minutesToLabel(data.sum)} |
            Überstunden: +{minutesToLabel(data.over)} |
            Minusstunden: –{minutesToLabel(data.under)}
          </div>
        </div>
      ))}

      <div className="text-right font-bold">
        Monatssumme: {minutesToLabel(monthSum)} | Überstunden +{minutesToLabel(overSum)} | Minusstunden –{minutesToLabel(underSum)}
      </div>
    </div>
  );
}
