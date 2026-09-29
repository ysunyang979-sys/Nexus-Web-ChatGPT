import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Sidebar Responsive Layout & Quality Contract Suite", () => {
  const sidebarPath = path.resolve(process.cwd(), "apps/desktop/src/components/Sidebar.tsx");
  const sidebarCode = fs.readFileSync(sidebarPath, "utf-8");

  it("verifies explicit width constants for collapsed (60px) and expanded (228px) states", () => {
    expect(sidebarCode).toContain("w-[60px]");
    expect(sidebarCode).toContain("w-[228px]");
  });

  it("verifies brand avatar container", () => {
    expect(sidebarCode).toContain("w-6 h-6");
  });

  it("ensures top-pinned toggle button handles rail collapsing", () => {
    expect(sidebarCode).toContain("setCollapsed");
    expect(sidebarCode).toContain("ChevronLeft");
    expect(sidebarCode).toContain("ChevronRight");
  });

  it("verifies icon tooltips and navigation items", () => {
    expect(sidebarCode).toContain("title={item.label}");
    expect(sidebarCode).toContain("navGroups");
  });

  it("verifies strict display of product version", () => {
    expect(sidebarCode).toMatch(/1\.(2|20)/);
    expect(sidebarCode).not.toContain("v2.0.0");
  });
});
