import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

// SW NUR in Production registrieren (verhindert leere Seite im Dev)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  import("./pwa-register.ts")
    .then((m) => m?.registerPWA && m.registerPWA())
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
