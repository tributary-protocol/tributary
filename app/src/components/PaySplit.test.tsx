/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "../lib/i18n";

const checkTrustlines = vi.fn();

vi.mock("../lib/tributary", () => ({
  walletClient: vi.fn(),
  toStroops: (value: string) => BigInt(Math.round(parseFloat(value) * 10_000_000)),
  fromStroops: (value: bigint) => String(value),
  previewPayout: vi.fn().mockResolvedValue([]),
  recipientLabel: (recipient: unknown) => String(recipient),
  checkTrustlines: (...args: unknown[]) => checkTrustlines(...args),
  shortAddress: (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`,
  TOKENS: [
    { code: "XLM", contract: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAX" },
    { code: "USDC", contract: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY" },
  ],
}));

import PaySplit from "./PaySplit";

const WALLET = "G".concat("A".repeat(55));
const RECIPIENT = "G".concat("B".repeat(55));

const SPLIT = {
  id: 1n,
  recipients: [{ tag: "Account", values: [RECIPIENT] }],
  shares: [10_000],
  controller: undefined,
};

function renderPaySplit() {
  return render(
    <I18nProvider>
      <PaySplit
        wallet={WALLET}
        splits={[SPLIT as never]}
        selectedSplitId="1"
        onPaid={() => {}}
      />
    </I18nProvider>,
  );
}

function payButton(): HTMLButtonElement {
  return screen.getByText("Pay").closest("button") as HTMLButtonElement;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("PaySplit trustline blocking", () => {
  it("disables the pay button while a blocking trustline warning is active", async () => {
    checkTrustlines.mockResolvedValue({
      warnings: [{ address: RECIPIENT, status: "no_trustline" }],
      hasErrors: false,
    });

    renderPaySplit();

    // Let the 400 ms debounce fire and the check resolve.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(payButton().disabled).toBe(true);
  });

  it("re-enables the pay button once the warning clears", async () => {
    // First check (XLM): blocking. Second check (USDC): clean.
    checkTrustlines
      .mockResolvedValueOnce({
        warnings: [{ address: RECIPIENT, status: "no_trustline" }],
        hasErrors: false,
      })
      .mockResolvedValueOnce({ warnings: [], hasErrors: false });

    renderPaySplit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(payButton().disabled).toBe(true);

    // Switching tokens re-runs the debounced check, which now comes back clean.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByDisplayValue("XLM"), { target: { value: "USDC" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(payButton().disabled).toBe(false);
  });

  it("does not block on inconclusive warnings", async () => {
    checkTrustlines.mockResolvedValue({
      warnings: [{ address: RECIPIENT, status: "inconclusive" }],
      hasErrors: false,
    });

    renderPaySplit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole("status")).toBeTruthy();
    expect(payButton().disabled).toBe(false);
  });
});
