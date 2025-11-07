// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css"; // <-- hier!

const RAW_BASE = import.meta.env.VITE_BASE || "/Zeiterfassung";
const BASENAME = RAW_BASE.endsWith("/") ? RAW_BASE.slice(0, -1) : RAW_BASE;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={BASENAME}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
