/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../lib/i18n";
import CreateSplit from "./CreateSplit";

vi.mock("../lib/tributary", () => ({
  walletClient: vi.fn(),
}));

import { walletClient } from "../lib/tributary";

const WALLET = "G".concat("A".repeat(55));

function renderCreateSplit() {
  return render(
    <I18nProvider>
      <CreateSplit wallet={WALLET} onCreated={() => {}} />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateSplit share validation", () => {
  it("blocks submit with a visible error when shares don't sum to 100%", () => {
    renderCreateSplit();

    // Default rows are 60/40; push the first share to 90 so the total is 130%.
    const firstShare = screen.getByLabelText("Recipient 1 share percentage");
    fireEvent.change(firstShare, { target: { value: "90" } });

    fireEvent.click(screen.getByText("Create split"));

    expect(screen.getByText("Shares must add up to 100%.")).toBeTruthy();
    // The submit path never reaches the contract client.
    expect(walletClient).not.toHaveBeenCalled();
  });

  it("shows the running total as out of range", () => {
    renderCreateSplit();

    const firstShare = screen.getByLabelText("Recipient 1 share percentage");
    fireEvent.change(firstShare, { target: { value: "90" } });

    const total = screen.getByText("130% of 100%");
    expect(total.className).toBe("total");
  });

  it("does not show the share-total error when shares sum to 100%", () => {
    renderCreateSplit();

    // Shares are valid (60/40) but addresses are empty, so submit is still
    // blocked — by the next validation, not the share total.
    fireEvent.click(screen.getByText("Create split"));

    expect(screen.queryByText("Shares must add up to 100%.")).toBeNull();
    expect(walletClient).not.toHaveBeenCalled();
  });
});
