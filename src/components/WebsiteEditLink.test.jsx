import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WebsiteEditLink, { WEBSITE_EDIT_URL } from "./WebsiteEditLink.jsx";

describe("Website bearbeiten", () => {
  it("links admins to the existing Work chat", () => {
    const html = renderToStaticMarkup(<WebsiteEditLink currentUser={{ role: "admin" }} role="admin" />);
    expect(html).toContain(`href="${WEBSITE_EDIT_URL}"`);
    expect(html).toContain("Website bearbeiten");
  });
  it.each(["mitarbeiter", "teamleiter", "buchhaltung", "", undefined])("hides the link for %s, including conflicting roles", (role) => {
    for (const [userRole, navRole] of [[role, role], [role, "admin"], ["admin", role]]) {
      expect(renderToStaticMarkup(<WebsiteEditLink currentUser={{ role: userRole, permissions: { manageEmployees: true } }} role={navRole} />)).toBe("");
    }
  });
  it("hides the link without a signed-in user", () => {
    expect(renderToStaticMarkup(<WebsiteEditLink role="admin" />)).toBe("");
  });
});
