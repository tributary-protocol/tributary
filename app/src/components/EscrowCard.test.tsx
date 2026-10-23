/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { I18nProvider } from "../lib/i18n";

const mocks = vi.hoisted(() => {
  const deposit = vi.fn();
  const distribute = vi.fn();
  return {
    balance: vi.fn(),
    deposit,
    distribute,
    walletClient: vi.fn(() => ({ deposit, distribute })),
  };
});

vi.mock("../lib/tributary", () => ({
  readClient: () => ({ balance: mocks.balance }),
  walletClient: mocks.walletClient,
  toStroops: (value: string) =>
    BigInt(Math.round(parseFloat(value) * 10_000_000)),
  fromStroops: (value: bigint) => String(value),
  TOKENS: [
    {
      code: "XLM",
      contract: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAX",
      decimals: 7,
    },
  ],
}));

import EscrowCard from "./EscrowCard";

const WALLET = "G".concat("A".repeat(55));
const TOKEN_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAX";

const SPLIT = {
  id: 1n,
  recipients: [{ tag: "Account", values: [WALLET] }],
  shares: [10_000],
  controller: undefined,
};

function signedTx(amount: bigint) {
  return {
    signAndSend: vi.fn().mockResolvedValue({
      result: { isOk: () => true, unwrap: () => amount },
    }),
  };
}

function renderCard() {
  return render(
    <I18nProvider>
      <EscrowCard
        wallet={WALLET}
        splits={[SPLIT as never]}
        selectedSplitId="1"
      />
    </I18nProvider>,
  );
}

function depositButton(): HTMLButtonElement {
  return screen.getByText("Deposit").closest("button") as HTMLButtonElement;
}

function distributeButton(): HTMLButtonElement {
  return screen.getByText("Distribute").closest("button") as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EscrowCard deposit and distribute flow", () => {
  it("submits the entered amount when deposit is clicked", async () => {
    mocks.balance.mockResolvedValue({ result: 0n });
    mocks.deposit.mockResolvedValue(signedTx(0n));
    mocks.distribute.mockResolvedValue(signedTx(0n));

    renderCard();
    await act(async () => {});

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "12.5" },
    });
    fireEvent.click(depositButton());
    await act(async () => {});

    expect(mocks.deposit).toHaveBeenCalledWith({
      from: WALLET,
      id: 1n,
      token: TOKEN_CONTRACT,
      amount: 125_000_000n,
    });
    expect(screen.getByText("Deposited 12.5 XLM.")).toBeTruthy();
  });

  it("keeps distribute disabled while there is no pending balance", async () => {
    mocks.balance.mockResolvedValue({ result: 0n });

    renderCard();
    await act(async () => {});

    expect(distributeButton().disabled).toBe(true);
  });

  it("enables distribute once a pending balance exists", async () => {
    mocks.balance.mockResolvedValue({ result: 25_000_000n });

    renderCard();
    await act(async () => {});
    await act(async () => {});

    expect(distributeButton().disabled).toBe(false);
  });
});
