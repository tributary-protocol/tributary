// @vitest-environment jsdom
//
// Rendered tests for RecipientEditor's duplicate-recipient warning.
//
// The environment is set per-file rather than in vite.config.ts, so the existing
// node-environment tests (RecipientEditor.test.ts and friends) keep running unchanged.
//
// These assert on the warning *elements* -- .dupe-note, .dupe-input, and the
// aria-label="Duplicate recipient" marker -- rather than on their text. Three of the
// i18n keys the component asks for (duplicateRecipientNote, duplicateAddressHint,
// duplicateRecipientError) are missing from the translations table, so t() currently
// falls through to returning the key itself. Asserting on the rendered copy would pin
// that bug in place; asserting on the elements is right both now and after it is fixed.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import RecipientEditor, { type Row } from "./RecipientEditor";
import { I18nProvider } from "../lib/i18n";

const G = "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const G2 = "GEFGHIJKLMNOPQRSTUVWXYZ234567EFGHIJKLMNOPQRSTUVWXYZ23456";

function renderEditor(rows: Row[]) {
  const { container } = render(
    <I18nProvider>
      <RecipientEditor rows={rows} onChange={() => {}} />
    </I18nProvider>,
  );
  return container;
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
    const container = renderEditor([address(G, "50"), address(G, "50")]);

    expect(container.querySelector(".dupe-note")).not.toBeNull();
  });

  it("marks both offending rows, not just the second", () => {
    const container = renderEditor([address(G, "50"), address(G, "50")]);

    expect(container.querySelectorAll(".dupe-input")).toHaveLength(2);
    expect(container.querySelectorAll('[aria-label="Duplicate recipient"]')).toHaveLength(2);
  });

  it("leaves a unique set of recipients unwarned", () => {
    const container = renderEditor([address(G, "50"), address(G2, "50")]);

    expect(container.querySelector(".dupe-note")).toBeNull();
    expect(container.querySelectorAll(".dupe-input")).toHaveLength(0);
  });

  it("treats addresses differing only in whitespace as the same recipient", () => {
    // The component keys on value.trim(), and a pasted address often carries a space.
    const container = renderEditor([address(G, "50"), address(`  ${G} `, "50")]);

    expect(container.querySelector(".dupe-note")).not.toBeNull();
    expect(container.querySelectorAll(".dupe-input")).toHaveLength(2);
  });

  it("does not warn about repeated split ids", () => {
    // duplicateAddresses only considers address-type rows: the same split appearing
    // twice is a different question from the same account being paid twice.
    const container = renderEditor([split("42", "50"), split("42", "50")]);

    expect(container.querySelector(".dupe-note")).toBeNull();
  });

  it("marks every row of a triplicated address", () => {
    const container = renderEditor([
      address(G, "34"),
      address(G, "33"),
      address(G, "33"),
    ]);

    expect(container.querySelectorAll(".dupe-input")).toHaveLength(3);
    // One note for the whole editor, however many rows are involved.
    expect(container.querySelectorAll(".dupe-note")).toHaveLength(1);
  });

  it("marks two separate duplicated addresses independently", () => {
    const container = renderEditor([
      address(G, "25"),
      address(G, "25"),
      address(G2, "25"),
      address(G2, "25"),
    ]);

    expect(container.querySelectorAll(".dupe-input")).toHaveLength(4);
    expect(container.querySelectorAll(".dupe-note")).toHaveLength(1);
  });

  it("does not warn on an empty editor", () => {
    const container = renderEditor([]);

    expect(container.querySelector(".dupe-note")).toBeNull();
  });

  it("does not treat two empty address rows as duplicates of each other", () => {
    // An empty value is "not filled in yet", not a repeated recipient; the empty-row
    // error covers that case instead.
    const container = renderEditor([address("", "50"), address("", "50")]);

    expect(container.querySelector(".dupe-note")).toBeNull();
  });
});
