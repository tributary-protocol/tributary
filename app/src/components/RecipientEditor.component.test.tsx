// @vitest-environment jsdom
//
// Rendered tests for RecipientEditor's duplicate-recipient warning.
//
// The environment is set per-file rather than in vite.config.ts, so the existing
// node-environment tests (RecipientEditor.test.ts and friends) keep running unchanged.
//
// These assert on the aria-label="Duplicate recipient" marker each flagged row carries,
// not on class names (which exist for styling) or on the warning copy. The marker
// count is the thing that matters: one per offending row, none when every recipient
// is unique.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

import RecipientEditor, { type Row } from "./RecipientEditor";
import { I18nProvider } from "../lib/i18n";

const G = "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const G2 = "GEFGHIJKLMNOPQRSTUVWXYZ234567EFGHIJKLMNOPQRSTUVWXYZ23456";

function renderEditor(rows: Row[]) {
  render(
    <I18nProvider>
      <RecipientEditor rows={rows} onChange={() => {}} />
    </I18nProvider>,
  );
}

function flaggedRows() {
  return screen.queryAllByLabelText("Duplicate recipient");
}

// Cleanup is explicit: @testing-library/react only registers its automatic afterEach
// when vitest globals are enabled, and this project does not enable them. Without this,
// renders pile up in document.body and any unscoped query sees every earlier test's DOM.
afterEach(cleanup);

function address(value: string, percent: string): Row {
  return { kind: "address", value, percent };
}

function split(value: string, percent: string): Row {
  return { kind: "split", value, percent };
}

describe("RecipientEditor duplicate warning", () => {
  it("warns when the same recipient address is added twice", () => {
    renderEditor([address(G, "50"), address(G, "50")]);

    expect(flaggedRows()).toHaveLength(2);
  });

  it("marks both offending rows, not just the second", () => {
    renderEditor([address(G, "50"), address(G, "50")]);

    expect(flaggedRows()).toHaveLength(2);
  });

  it("leaves a unique set of recipients unwarned", () => {
    renderEditor([address(G, "50"), address(G2, "50")]);

    expect(flaggedRows()).toHaveLength(0);
  });

  it("treats addresses differing only in whitespace as the same recipient", () => {
    // The component keys on value.trim(), and a pasted address often carries a space.
    renderEditor([address(G, "50"), address(`  ${G} `, "50")]);

    expect(flaggedRows()).toHaveLength(2);
  });

  it("does not warn about repeated split ids", () => {
    // duplicateAddresses only considers address-type rows: the same split appearing
    // twice is a different question from the same account being paid twice.
    renderEditor([split("42", "50"), split("42", "50")]);

    expect(flaggedRows()).toHaveLength(0);
  });

  it("marks every row of a triplicated address", () => {
    renderEditor([
      address(G, "34"),
      address(G, "33"),
      address(G, "33"),
    ]);

    expect(flaggedRows()).toHaveLength(3);
  });

  it("marks two separate duplicated addresses independently", () => {
    renderEditor([
      address(G, "25"),
      address(G, "25"),
      address(G2, "25"),
      address(G2, "25"),
    ]);

    expect(flaggedRows()).toHaveLength(4);
  });

  it("does not warn on an empty editor", () => {
    renderEditor([]);

    expect(flaggedRows()).toHaveLength(0);
  });

  it("does not treat two empty address rows as duplicates of each other", () => {
    // An empty value is "not filled in yet", not a repeated recipient; the empty-row
    // error covers that case instead.
    renderEditor([address("", "50"), address("", "50")]);

    expect(flaggedRows()).toHaveLength(0);
  });
});
