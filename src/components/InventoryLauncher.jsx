import React from "react";

function normalizeRole(role) {
  return String(role || "mitarbeiter").trim().toLowerCase();
}

export default function InventoryLauncher({ currentUser = null, role = "mitarbeiter" }) {
  const resolvedRole = normalizeRole(role || currentUser?.role);
  const inventoryUrl = `/lagerverwaltung/index.html?role=${encodeURIComponent(resolvedRole)}`;

  return (
    <main className="hbz-container inventory-launcher">
      <header className="inventory-launcher-head hbz-card">
        <div>
          <div className="eyebrow">Lager</div>
          <h1>Lagerverwaltung</h1>
          <p>Materialien, Befestigungsmittel, QR-/Barcode und Buchungen als eigener Bereich.</p>
        </div>
        <a className="hbz-btn hbz-btn-primary" href={inventoryUrl} target="_blank" rel="noreferrer">
          Separat öffnen
        </a>
      </header>
      <section className="inventory-launcher-frame hbz-card">
        <iframe title="Lagerverwaltung" src={inventoryUrl} />
      </section>
      <style>{`
        .inventory-launcher-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .inventory-launcher-head h1 {
          margin: 3px 0;
        }
        .inventory-launcher-head p {
          color: #6f6259;
          margin: 0;
        }
        .inventory-launcher-frame {
          padding: 0;
          overflow: hidden;
        }
        .inventory-launcher-frame iframe {
          border: 0;
          display: block;
          height: min(78vh, 900px);
          min-height: 620px;
          width: 100%;
        }
        @media (max-width: 700px) {
          .inventory-launcher-head {
            align-items: stretch;
            flex-direction: column;
          }
          .inventory-launcher-frame iframe {
            min-height: 720px;
          }
        }
      `}</style>
    </main>
  );
}
