import React from "react";

// Opens the existing local Work chat without sending a prompt or granting access.
export const WEBSITE_EDIT_URL = "codex://threads/01a180a4-6e3c-7f42-9c16-fca064ee8bc5";

export default function WebsiteEditLink({ currentUser, role }) {
  if (role !== "admin" || currentUser?.role !== "admin") return null;
  return (
    <a className="app-nav-btn" href={WEBSITE_EDIT_URL}
      title="Diesen Zeiterfassungs-Chat in der installierten Work-App öffnen">
      <span className="app-nav-label">Website bearbeiten</span>
    </a>
  );
}
