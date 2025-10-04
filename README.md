# Zeiterfassung V32 (auf Basis deiner PWA v31a)

Dieses Projekt kapselt deine bestehende PWA (unverändert in `/public`) mit einem Node/Express‑Backend (SQLite) für:
- Rollen & Rechte (ADMIN / TEAMLEITER / MITARBEITER)
- Erstlogin → Passwortwechsel erzwingen
- Monatsübersicht: editierbar nur für ADMIN (Server-seitig enforced)
- Urlaub/Krank als Tag-Typen
- Admin-Impersonate
- iPhone/Chrome Cookie‑Fix (`SameSite=None; Secure`) und optional HTTPS‑Redirect

## Quickstart
```bash
cp .env.example .env   # JWT_SECRET setzen!
npm install
npm run init-db
npm start              # http://localhost:8080
```
**Seiten:**  
- Deine PWA: `/` (dein ursprüngliches `index.html` etc.)  
- Login: `/login.html`  
- Dashboard: `/dashboard.html`  

**Demo-Logins:**  
- Admin: admin@demo.local / admin123  
- Teamleiter: lead@demo.local / lead123  
- Mitarbeiter: user@demo.local / user123

## GitHub
Dieses Verzeichnis ist GitHub-ready (.gitignore, README, Workflow).

## Hinweis
Deine ursprünglichen Dateien wurden nicht verändert, nur in `/public` abgelegt. Du kannst Stück für Stück dein UI ans Backend anbinden.
