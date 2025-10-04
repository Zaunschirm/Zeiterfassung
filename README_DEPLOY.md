# Zeiterfassung V32 (Minimal, Node + SQLite + Vanilla JS)

Features:
- Rollen: ADMIN, TEAMLEITER, MITARBEITER
- Erstlogin -> Passwort ändern erzwungen
- Monatsübersicht editierbar **nur** für ADMIN (Server prüft immer)
- Urlaub/Krank als Tag-Typen (WORK | URLAUB | KRANK)
- Admin-Fallback: als Benutzer anmelden (Impersonate) inkl. Audit
- Login-Cookies kompatibel mit iPhone/Chrome (`SameSite=None; Secure` in Production)
- Komplett statisches Frontend (HTML/JS/CSS), Express-API, SQLite

## Quickstart (Production oder Test)
1) Entpacken
2) `cp .env.example .env` und `JWT_SECRET` setzen (langer Random String)
3) `npm install`
4) **DB initialisieren:** `npm run init-db`
   - Erstellt `data/app.sqlite`
   - Legt Admin an: E-Mail `admin@demo.local`, Passwort `admin123`, Rolle `ADMIN`
   - Legt Beispiel-User an (Teamleiter, Mitarbeiter)
5) Starten: `npm start`
6) Aufrufen: `http://localhost:8080`

**Hinweis zu Cookies/HTTPS:** In `NODE_ENV=production` werden Cookies mit `Secure; SameSite=None` gesetzt. 
Für lokalen Test kannst du `NODE_ENV=development` setzen; dann werden Cookies nicht `Secure` markiert.
Setze `FORCE_HTTPS=true`, wenn deine Umgebung Proxy/HTTPS nutzt.

## Deployment
- Node >= 18
- Reverse Proxy (z. B. Nginx) auf HTTPS
- Optional `COOKIE_DOMAIN` setzen, z. B. `.firma.at`
- Datenbank liegt in `./data/app.sqlite`

## Default-Zugänge nach Init
- Admin: `admin@demo.local` / `admin123` (Bitte nach Erstlogin ändern)
- Teamleiter: `lead@demo.local` / `lead123`
- Mitarbeiter: `user@demo.local` / `user123`

## API-Kurzüberblick
- POST /api/auth/login {email,password}
- POST /api/auth/logout
- GET  /api/me
- POST /api/password-change {oldPassword,newPassword}
- POST /api/admin/impersonate {userId}
- GET  /api/timesheets?month=YYYY-MM&userId=
- POST /api/timesheets
- PUT  /api/timesheets/:id
- POST /api/users  (ADMIN)
- POST /api/users/:id/role (ADMIN)

## Lizenz
Dieses Paket ist "as is". Bitte vor Produktionseinsatz prüfen/hardenen.
