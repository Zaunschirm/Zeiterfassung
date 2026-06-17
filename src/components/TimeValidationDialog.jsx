import React from "react";

export default function TimeValidationDialog({ warnings, onCancel, onConfirm }) {
  if (!warnings?.length) return null;

  return (
    <div className="month-modal-backdrop" role="presentation">
      <div className="month-modal" role="dialog" aria-modal="true" aria-labelledby="time-validation-title">
        <div className="month-modal-head">
          <div>
            <div className="eyebrow">Plausibilitätsprüfung</div>
            <h3 id="time-validation-title">Eintrag prüfen</h3>
            <div className="month-modal-subtitle">
              Bitte kontrolliere die Hinweise, bevor der Eintrag gespeichert wird.
            </div>
          </div>
        </div>

        <div className="month-modal-box">
          <div className="month-modal-box-title">Hinweise</div>
          <ul className="month-modal-checklist">
            {warnings.map((message, index) => (
              <li key={`${index}-${message}`}>
                <span style={{ whiteSpace: "pre-line" }}>{message}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="month-modal-actions">
          <button type="button" className="hbz-btn hbz-btn-ghost" onClick={onCancel}>
            Zurück bearbeiten
          </button>
          <button type="button" className="save-btn" onClick={onConfirm}>
            Trotzdem speichern
          </button>
        </div>
      </div>
    </div>
  );
}
