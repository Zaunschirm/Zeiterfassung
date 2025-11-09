// src/components/TimeTracking.jsx
import React, { useState } from "react";

/**
 * Minimaler Platzhalter für die Zeiterfassung.
 * - blockiert den Build nicht
 * - nutzt eure HBZ-Styles
 * - kann später 1:1 durch die echte Logik ersetzt werden
 */
export default function TimeTracking() {
  const [project, setProject] = useState("");
  const [task, setTask] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");

  function handleSave(e) {
    e.preventDefault();
    alert(
      `Platzhalter gespeichert:\nProjekt: ${project}\nTätigkeit: ${task}\nVon: ${from}\nBis: ${to}\nNotiz: ${note}`
    );
  }

  return (
    <div className="hbz-container">
      <div className="hbz-card">
        <h2 className="hbz-title" style={{ color: "var(--hbz-brown)" }}>
          Zeiterfassung (Platzhalter)
        </h2>
        <p style={{ marginTop: 6 }}>
          Diese Datei ist ein Platzhalter, damit eure App wieder startet. Ersetze
          sie später mit der echten Zeiterfassung (DaySlider, Mitarbeiter-Auswahl,
          Projektauswahl usw.).
        </p>

        <form onSubmit={handleSave} className="hbz-grid hbz-grid-3" style={{ marginTop: 12 }}>
          <div>
            <label className="hbz-label">Projekt</label>
            <input
              className="hbz-input"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Projektname"
            />
          </div>

          <div>
            <label className="hbz-label">Tätigkeit</label>
            <input
              className="hbz-input"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="z. B. Montage"
            />
          </div>

          <div>
            <label className="hbz-label">Von</label>
            <input
              className="hbz-input"
              type="time"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="hbz-label">Bis</label>
            <input
              className="hbz-input"
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="hbz-grid" style={{ gridColumn: "1 / -1" }}>
            <label className="hbz-label">Notiz</label>
            <textarea
              className="hbz-textarea"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optionale Notiz…"
            />
          </div>

          <div className="save-btn-wrapper" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="save-btn">
              <span className="btn-icon">💾</span> Speichern (Demo)
            </button>
          </div>
        </form>
      </div>

      <div className="hbz-section ok" style={{ padding: 12, marginTop: 12 }}>
        <strong>Hinweis:</strong> Die eigentliche „TimeTracking“-Funktion kannst du
        später hier einbauen oder diese Datei durch eure vollständige Version ersetzen.
      </div>
    </div>
  );
}
