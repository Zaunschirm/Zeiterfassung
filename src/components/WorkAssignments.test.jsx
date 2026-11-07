import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../lib/session", () => ({ getSession: vi.fn() }));
import { getSession } from "../lib/session";
import WorkAssignments from "./WorkAssignments.jsx";

describe("planning ZA button", () => {
  it("offers a full-day ZA action to an administrator", () => {
    getSession.mockReturnValue({ user: { role: "admin" } });
    expect(renderToStaticMarkup(<WorkAssignments />)).toContain('title="Zeitausgleich für den ganzen Tag gemäß Sollstunden eintragen"');
  });
  it("does not offer the action to an employee without planning permissions", () => {
    getSession.mockReturnValue({ user: { role: "mitarbeiter" } });
    expect(renderToStaticMarkup(<WorkAssignments />)).not.toContain('title="Zeitausgleich für den ganzen Tag gemäß Sollstunden eintragen"');
  });
});
