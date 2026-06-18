import React, { useMemo } from "react";

const minutesFromTime = (value) => {
  const [hours, minutes] = String(value || "0:0")
    .split(":")
    .map((part) => parseInt(part || "0", 10) || 0);
  return hours * 60 + minutes;
};

export default function TimeEntryEditDialog({
  entry,
  editState,
  setEditState,
  projects = [],
  craneHourOptions = [],
  weatherOptions = [],
  onCancel,
  onSave,
}) {
  const totals = useMemo(() => {
    if (!editState) return { hours: 0, overtime: 0 };
    const start = minutesFromTime(editState.from_hm);
    const end = minutesFromTime(editState.to_hm);
    const breakMinutes = parseInt(editState.break_min || "0", 10) || 0;
    const travelMinutes = parseInt(editState.travel_minutes || "0", 10) || 0;
    const minutes = Math.max(end - start - breakMinutes, 0) + travelMinutes;
    const hours = Math.round((minutes / 60) * 100) / 100;
    return { hours, overtime: Math.max(hours - 9, 0) };
  }, [editState]);

  if (!entry || !editState) return null;

  const update = (field, value) =>
    setEditState((current) => ({ ...current, [field]: value }));

  return (
    <div className="time-edit-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="time-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-edit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="time-edit-head">
          <div>
            <h2 id="time-edit-title">Eintrag bearbeiten</h2>
            <p>{entry.employee_name || entry.employee_id} · {entry.work_date}</p>
          </div>
          <button type="button" className="time-edit-close" onClick={onCancel} aria-label="Schließen">×</button>
        </header>

        <div className="time-edit-body">
          <div className="time-edit-field time-edit-wide">
            <label className="hbz-label">Projekt</label>
            <select className="hbz-input" value={editState.project_id ?? ""} onChange={(event) => update("project_id", event.target.value || null)}>
              <option value="">— ohne Projekt —</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code ? `${project.code} · ${project.name}` : project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="time-edit-grid">
            <div className="time-edit-field"><label className="hbz-label">Start</label><input type="time" className="hbz-input" value={editState.from_hm} onChange={(event) => update("from_hm", event.target.value)} /></div>
            <div className="time-edit-field"><label className="hbz-label">Ende</label><input type="time" className="hbz-input" value={editState.to_hm} onChange={(event) => update("to_hm", event.target.value)} /></div>
            <div className="time-edit-field"><label className="hbz-label">Pause (min)</label><input type="number" min="0" step="5" className="hbz-input" value={editState.break_min} onChange={(event) => update("break_min", event.target.value)} /></div>
            <div className="time-edit-field"><label className="hbz-label">Fahrzeit (min)</label><input type="number" min="0" step="5" className="hbz-input" value={editState.travel_minutes ?? 0} onChange={(event) => update("travel_minutes", event.target.value)} /></div>
            <div className="time-edit-field"><label className="hbz-label">Kran (h)</label><select className="hbz-input" value={editState.crane_hours ?? 0} onChange={(event) => update("crane_hours", event.target.value)}><option value="0">—</option>{craneHourOptions.map((hours) => <option key={hours} value={hours}>{hours} h</option>)}</select></div>
            <div className="time-edit-field"><label className="hbz-label">Privat-PKW (km)</label><input type="number" min="0" step="0.5" className="hbz-input" value={editState.private_pkw_km ?? 0} onChange={(event) => update("private_pkw_km", event.target.value)} /></div>
            <div className="time-edit-field"><label className="hbz-label">ZA-Stunden</label><input type="number" min="0" step="0.25" className="hbz-input" value={editState.za_hours ?? 0} onChange={(event) => update("za_hours", event.target.value)} /></div>
            <div className="time-edit-field"><label className="hbz-label">Schlechtwetter</label><button type="button" className={`hbz-chip time-edit-toggle${editState.bad_weather ? " active" : ""}`} onClick={() => update("bad_weather", !editState.bad_weather)}>{editState.bad_weather ? "Aktiv" : "Nein"}</button></div>
          </div>

          <div className="time-edit-field time-edit-wide">
            <label className="hbz-label">Wetter</label>
            <select className="hbz-input" value={editState.weather_manual || "Automatisch"} onChange={(event) => update("weather_manual", event.target.value === "Automatisch" ? "" : event.target.value)}>
              {weatherOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="time-edit-field time-edit-wide"><label className="hbz-label">Notiz / Tätigkeit</label><textarea className="hbz-textarea" rows="3" value={editState.note} onChange={(event) => update("note", event.target.value)} /></div>
        </div>

        <footer className="time-edit-foot">
          <div className="time-edit-total"><span>Arbeitszeit</span><strong>{totals.hours.toFixed(2)} h · Ü: {totals.overtime.toFixed(2)} h</strong></div>
          <div className="time-edit-actions"><button type="button" className="hbz-btn" onClick={onCancel}>Abbrechen</button><button type="button" className="save-btn" onClick={onSave}>Änderungen speichern</button></div>
        </footer>

        <style>{`
          .time-edit-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(40,29,21,.48); backdrop-filter: blur(2px); }
          .time-edit-dialog { width: min(680px, 100%); max-height: calc(100vh - 36px); overflow: hidden; display: flex; flex-direction: column; border: 1px solid #ddcbb9; border-radius: 8px; background: #fffdf9; box-shadow: 0 20px 60px rgba(47,36,27,.28); }
          .time-edit-head { padding: 15px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #eadfd3; }
          .time-edit-head h2 { margin: 0; font-size: 19px; letter-spacing: 0; }
          .time-edit-head p { margin: 4px 0 0; color: #7a614e; font-size: 12px; }
          .time-edit-close { width: 36px; height: 36px; flex: 0 0 auto; border: 1px solid #ddcbb9; border-radius: 50%; background: #f7ede2; color: #5a3a23; font-size: 22px; cursor: pointer; }
          .time-edit-body { padding: 15px 16px; overflow-y: auto; }
          .time-edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }
          .time-edit-field { min-width: 0; margin-bottom: 12px; }
          .time-edit-toggle { width: 100%; min-height: 42px; border-radius: 8px; }
          .time-edit-foot { padding: 11px 16px 15px; border-top: 1px solid #eadfd3; background: #fffdf9; }
          .time-edit-total { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; color: #6f5745; font-size: 12px; }
          .time-edit-total strong { color: #2f241b; }
          .time-edit-actions { display: grid; grid-template-columns: 1fr 2fr; gap: 9px; }
          .time-edit-actions button { min-height: 46px; border-radius: 8px; }
          @media (max-width: 768px) {
            .time-edit-backdrop { align-items: flex-end; padding: 0; }
            .time-edit-dialog { width: 100%; max-height: calc(100vh - 28px); border-radius: 16px 16px 0 0; border-bottom: 0; }
            .time-edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .time-edit-foot { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
          }
        `}</style>
      </section>
    </div>
  );
}
