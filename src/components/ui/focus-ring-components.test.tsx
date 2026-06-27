/**
 * Task 6.7 — Focus Ring Component Rendering Tests (jsdom environment)
 *
 * Validates Requirements: 10.3, 10.9
 *
 * These tests verify that the focus-visible-ring class is present on all
 * interactive glass components, ensuring no focus indicator is silently
 * suppressed without an equivalent visible ring.
 */

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { GlassButton } from "./GlassButton";
import { GlassInput } from "./GlassInput";
import { GlassCard } from "./GlassCard";
import GlassPill from "./GlassPill";
import GlassModal from "./GlassModal";
import GlassTable from "@/components/composite/GlassTable";
import { StatCard } from "@/components/composite/StatCard";

describe("Task 6.7 — Focus Ring on Interactive Components (Req 10.3, 10.9)", () => {

  it("1. GlassButton renders with focus-visible-ring (Req 10.3, 3.3)", () => {
    // GlassButton must display a visible ring on keyboard focus.
    render(<GlassButton>Save</GlassButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("focus-visible-ring");
  });

  it("2. GlassButton variant='solid' also carries focus-visible-ring (Req 10.3, 3.3)", () => {
    render(<GlassButton variant="solid">Confirm</GlassButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("focus-visible-ring");
  });

  it("3. GlassInput carries focus-visible-ring (Req 10.3)", () => {
    // Native inputs must show a ring on keyboard focus (:focus-visible).
    render(<GlassInput placeholder="Project name" />);
    const input = screen.getByPlaceholderText("Project name");
    expect(input.className).toContain("focus-visible-ring");
  });

  it("4. GlassCard with onClick carries focus-visible-ring (Req 10.3, 3.7)", () => {
    // Interactive cards (with onClick) are tab-navigable and must show a ring.
    render(<GlassCard onClick={() => {}}>Card content</GlassCard>);
    const card = screen.getByText("Card content").closest("div")!;
    expect(card.className).toContain("focus-visible-ring");
  });

  it("5. GlassCard without onClick is NOT keyboard-focusable (no focus-visible-ring needed for passive containers, Req 10.3)", () => {
    // Non-interactive cards are not tab stops, so no ring is needed.
    const { container } = render(<GlassCard>Static card</GlassCard>);
    const card = container.firstChild as HTMLElement;
    // Non-interactive GlassCard should NOT have tabIndex (not in tab order)
    expect(card.getAttribute("tabindex")).toBeNull();
    // And should not be a button role
    expect(card.getAttribute("role")).toBeNull();
  });

  it("6. GlassPill with onClick carries focus-visible-ring (Req 10.3)", () => {
    render(<GlassPill onClick={() => {}}>Active</GlassPill>);
    const pill = screen.getByText("Active");
    expect(pill.className).toContain("focus-visible-ring");
  });

  it("7. GlassTable rows carry focus-visible-ring when onRowClick is provided (Req 10.3, 10.8)", () => {
    // Clickable table rows receive keyboard focus and must show a ring.
    const columns = [{ key: "name" as const, label: "Name" }];
    const rows = [{ name: "Project Alpha" }];
    const { container } = render(
      <GlassTable
        columns={columns}
        rows={rows}
        rowKey="name"
        onRowClick={() => {}}
      />
    );
    // GlassTable clickable rows render as role="button" (TR with click handler)
    const dataRow = container.querySelector('tr[role="button"]') as HTMLElement;
    expect(dataRow).not.toBeNull();
    expect(dataRow.className).toContain("focus-visible-ring");
  });

  it("8. StatCard with onClick carries focus-visible-ring (Req 10.3)", () => {
    // Interactive StatCards use role='button' and must be keyboard-focusable.
    render(<StatCard label="Active Projects" value={12} onClick={() => {}} />);
    const card = screen.getByRole("button");
    expect(card.className).toContain("focus-visible-ring");
  });

  it("9. GlassModal dialog panel carries focus-visible-ring (Req 10.3, 10.7)", () => {
    // The modal panel itself has tabIndex={-1} for programmatic focus management,
    // but also carries focus-visible-ring so if somehow focused via keyboard it
    // remains accessible.
    render(
      <GlassModal isOpen onClose={() => {}} aria-label="Confirm delete">
        <p>Confirm your action</p>
      </GlassModal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("focus-visible-ring");
  });

  it("10. GlassInput does NOT use focus:outline-none without a ring alternative (Req 10.9)", () => {
    // GlassInput uses focus:outline-none to suppress browser default outline,
    // but MUST pair it with focus-visible-ring which provides the custom ring.
    // Both must be present together.
    render(<GlassInput placeholder="check me" />);
    const input = screen.getByPlaceholderText("check me");
    // Both classes must be present simultaneously
    expect(input.className).toContain("focus:outline-none");
    expect(input.className).toContain("focus-visible-ring");
  });

  it("11. GlassCard interactive mode pairs focus:outline-none with focus-visible-ring (Req 10.9)", () => {
    render(<GlassCard onClick={() => {}}>Interactive</GlassCard>);
    const card = screen.getByText("Interactive").closest("div")!;
    // When outline is suppressed, the ring must be present
    if (card.className.includes("focus:outline-none")) {
      expect(card.className).toContain("focus-visible-ring");
    }
  });
});
