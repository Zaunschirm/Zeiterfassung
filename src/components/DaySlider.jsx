// components/DaySlider.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getSession } from "../lib/session";
import EmployeeList from "./EmployeeList.jsx";

// Helper: Minuten <-> "HH:MM"
const toHM = (m) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function DaySlider() {
  const session = getSession(); // { code, role, name }
  const isStaff = session?.role === "mitarbeiter";
  const isManager = session && !isStaff; // admin | teamleiter

  // UI-States
  const [date, setDate] = useState(() => {
    const d = new Date();
    // yyyy-mm-dd
    const iso = d.toISOString().slice(0, 10);
    return iso;
  });

  // Slider in Minuten seit 00:00
  const [fromMin, setFromMin] = useState(7 * 60);        // 07:00
  const [toMin, setToMin] = useState(16 * 60 + 30);      // 16:30
  const [breakMin, setBreakMin] = useState(30);          // 30
  const [note, setNote] = useState("");

  // Projekte
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);

  // Mitarbeiter (nur sichtbar/laden wenn admin/teamleiter)
  const [employees, setEmployees] = useState([]);
  const [selectedCode, setSelectedCode] = useState(
    isStaff ? session?.code ?? null : null
  );

  // aktuellen Mitarbeiter-Datensatz (id, name, code, role)
  const [employeeRow, setEmployeeRow] = useState(null);

  // --- Laden: Projekte (aktiv + nicht disabled), nach Name
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, code, name, active, disabled")
        .order("name", { ascending: true });

      if (!error) {
        const list = (data || []).filter(
          (p) => (p.active ?? true) === true && (p.disabled ?? false) === false
        );
        setProjects(list);
        if (list.length && !projectId) setProjectId(list[0].id);
      } else {
        console.error("projects load error:", error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Laden: Mitarbeiterliste (nur Manager)
  useEffect(() => {
    if (!isManager) return;
    (async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, code, name, role, active, disabled")
        .eq("active", true)
        .eq("disabled", false)
        .order("name", { ascending: true });

      if (!error) {
        setEmployees(data || []);
        if (!selectedCode && data && data.length > 0) {
          // Kein vorgewählter → none (User soll drücken) – oder nimm den ersten:
          // setSelectedCode(data[0].code);
        }
      } else {
        console.error("employees load error:", error);
      }
    })();
  }, [isManager, selectedCode]);

  // --- Mitarbeiter-Datensatz ermitteln (von selectedCode oder Session)
  useEffect(() => {
    (async () => {
      const code = isStaff ? session?.code : selectedCode;
      if (!code) {
        setEmployeeRow(null);
        return;
      }
      const { data, error } = await supabase
        .from("employees")
        .select("id, code, name, role, active, disabled")
        .eq("code", code)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setEmployeeRow(data);
      } else {
        console.error("employee fetch error:", error);
        setEmployeeRow(null);
      }
    })();
  }, [isStaff, selectedCode, session?.code]);

  // --- Berechnung der Tagesarbeitszeit
  const totalMin = useMemo(() => {
    const raw = clamp(toMin - fromMin, 0, 24 * 60);
    const total = clamp(raw - breakMin, 0, 24 * 60);
    return total;
  }, [fromMin, toMin, breakMin]);

  const handleSave = async () => {
    if (!employeeRow) {
      alert("Bitte zuerst Mitarbeiter auswählen.");
      return;
    }
    const prj = projects.find((p) => p.id === projectId) || null;

    // Serverseitige Sperre: Mitarbeiter dürfen NUR für sich speichern
    if (isStaff && employeeRow.code !== session.code) {
      alert("Nicht erlaubt: Mitarbeiter dürfen nur ihre eigene Zeit erfassen.");
      return;
    }

    const payload = {
      work_date: date, // date
      employee_id: employeeRow.id,             // int8
      employee_name: employeeRow.name,         // text (für den schnellen Überblick)
      project_id: prj ? prj.id : null,         // uuid | null
      project_code: prj ? prj.code : null,     // text | null
      project_name: prj ? prj.name : null,     // text | null
      from_min: fromMin,                       // int
      to_min: toMin,                           // int
      break_min: breakMin,                     // int
      total_min: totalMin,                     // int
      note: note?.trim() || null               // text | null
    };

    const { error } = await supabase.from("time_entries").insert(payload);
    if (error) {
      console.error("save error", error);
      alert("Speichern fehlgeschlagen.");
      return;
    }
    // Reset/Feedback
    setNote("");
    alert("Gespeichert.");
  };

  return (
    <div className="max-w-screen-lg mx-auto">
      {/* Datum */}
      <div className="flex gap-2 mb-3">
        <button
          className="px-3 py-1 rounded border"
          onClick={() => {
            const d = new Date(date);
            d.setDate(d.getDate() - 1);
            setDate(d.toISOString().slice(0, 10));
          }}
        >
          «
        </button>

        <input
          type="date"
          className="px-3 py-1 rounded border"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <button
          className="px-3 py-1 rounded border"
          onClick={() => {
            const d = new Date(date);
            d.setDate(d.getDate() + 1);
            setDate(d.toISOString().slice(0, 10));
          }}
        >
          »
        </button>
      </div>

      {/* Mitarbeiter-Wahl nur für Admin/Teamleiter */}
      {isManager && (
        <div className="mb-4">
          <EmployeeList
            employees={employees}
            selected={selectedCode}
            onSelect={(code) => setSelectedCode(code)}
          />
        </div>
      )}

      {/* Karte */}
      <div
        className="rounded-xl shadow"
        style={{
          background: "#fff",
          border: "1px solid #d9c9b6",
        }}
      >
        <div className="p-4">
          {/* Projekt */}
          <div className="mb-4">
            <label className="block mb-1 font-semibold">Projekt</label>
            <select
              className="w-full px-3 py-2 rounded border"
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value || null)}
            >
              <option value="">— ohne Projekt —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Slider Start/Ende/Pause */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Start */}
            <div>
              <div className="font-semibold mb-1">Start</div>
              <input
                type="range"
                min={5 * 60}
                max={19 * 60 + 30}
                step={15}
                value={fromMin}
                onChange={(e) => setFromMin(Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-2 text-2xl font-bold">{toHM(fromMin)}</div>
            </div>

            {/* Ende */}
            <div>
              <div className="font-semibold mb-1">Ende</div>
              <input
                type="range"
                min={5 * 60}
                max={19 * 60 + 30}
                step={15}
                value={toMin}
                onChange={(e) => setToMin(Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-2 text-2xl font-bold">{toHM(toMin)}</div>
            </div>

            {/* Pause */}
            <div>
              <div className="font-semibold mb-1">Pause</div>
              <input
                type="range"
                min={0}
                max={180}
                step={5}
                value={breakMin}
                onChange={(e) => setBreakMin(Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-2 text-2xl font-bold">
                {breakMin} min
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm">
              <span className="font-semibold">Arbeitszeit heute:</span>{" "}
              {Math.floor(totalMin / 60)}h {totalMin % 60}m
            </div>
          </div>

          {/* Notiz */}
          <div className="mt-4">
            <label className="block mb-1 font-semibold">Notiz</label>
            <textarea
              className="w-full h-24 rounded border px-3 py-2"
              placeholder="z. B. Tätigkeit, Besonderheiten…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded text-white"
              style={{ background: "#7b4a2d" }}
              disabled={!employeeRow}
              title={!employeeRow ? "Bitte Mitarbeiter auswählen" : "Speichern"}
            >
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
