/** @vitest-environment jsdom */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nProvider } from "../lib/i18n";

const mocks = vi.hoisted(() => ({
  balance: vi.fn(),
  deposit: vi.fn(),
  distribute: vi.fn(),
  signAndSend: vi.fn(),
  readClient: vi.fn(),
  walletClient: vi.fn(),
  toStroops: vi.fn(),
  fromStroops: vi.fn(),
}));

vi.mock("../lib/tributary", () => ({
  readClient: mocks.readClient,
  walletClient: mocks.walletClient,
  toStroops: mocks.toStroops,
  fromStroops: mocks.fromStroops,
  TOKENS: [
    { code: "XLM", contract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", decimals: 7 },
    { code: "USDC", contract: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", decimals: 6 },
  ],
  SplitView: {},
}));

vi.mock("./FeeHint", () => ({ default: () => null }));
vi.mock("./TokenPicker", () => ({ default: () => null }));

import EscrowCard from "./EscrowCard";

const WALLET = "G".concat("A".repeat(55));
const RECIPIENT_ONE = "G".concat("B".repeat(55));
const RECIPIENT_TWO = "G".concat("C".repeat(55));

const SPLIT = {
  id: 7n,
  recipients: [
    { tag: "Account", values: [RECIPIENT_ONE] },
    { tag: "Account", values: [RECIPIENT_TWO] },
  ],
  shares: [6_000, 4_000],
  controller: WALLET,
};

function okTransaction() {
  return {
    signAndSend: vi.fn().mockResolvedValue({
      result: { isOk: () => true, unwrap: () => 100n },
    }),
  };
}

function renderEscrowCard(wallet: string | null = WALLET, selectedSplitId?: string) {
  return render(
    <I18nProvider>
      <EscrowCard wallet={wallet} splits={[SPLIT]} selectedSplitId={selectedSplitId} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mocks.readClient.mockReturnValue({ balance: mocks.balance });
  mocks.walletClient.mockReturnValue({
    deposit: mocks.deposit,
    distribute: mocks.distribute,
  });
  mocks.toStroops.mockImplementation((amount: string) => BigInt(amount) * 10_000_000n);
  mocks.fromStroops.mockImplementation((s: bigint) => String(s));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EscrowCard deposit and distribute flow", () => {
  it("calls walletClient().deposit() with correct args when deposit is clicked", async () => {
    mocks.balance.mockResolvedValue({ result: 0n });
    mocks.deposit.mockResolvedValue(okTransaction());
    renderEscrowCard(WALLET, "7");

    await waitFor(() => expect(mocks.balance).toHaveBeenCalled());

    const amountInput = screen.getByPlaceholderText("Amount");
    fireEvent.change(amountInput, { target: { value: "10" } });

    fireEvent.click(screen.getByText("Deposit"));

    await waitFor(() => {
      expect(mocks.deposit).toHaveBeenCalledWith({
        from: WALLET,
        id: 7n,
        token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        amount: 100_000_000n,
      });
    });
  });

  it("disables distribute when pending balance is null", async () => {
    mocks.balance.mockRejectedValue(new Error("no balance"));
    renderEscrowCard(WALLET, "7");

    await waitFor(() => expect(mocks.balance).toHaveBeenCalled());

    expect((screen.getByText("Distribute").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables distribute when pending balance exists and calls distribute()", async () => {
    mocks.balance.mockResolvedValue({ result: 500n });
    mocks.distribute.mockResolvedValue(okTransaction());
    renderEscrowCard(WALLET, "7");

    await waitFor(() => expect(mocks.balance).toHaveBeenCalled());

    const distributeBtn = screen.getByText("Distribute");
    expect((screen.getByText("Distribute").closest("button") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(distributeBtn);

    await waitFor(() => {
      expect(mocks.distribute).toHaveBeenCalledWith({
        id: 7n,
        token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      });
    });
  });

  it("shows pending balance", async () => {
    mocks.balance.mockResolvedValue({ result: 1000n });
    renderEscrowCard(WALLET, "7");

    await waitFor(() => {
      expect(screen.getByText(/Pending/)).toBeTruthy();
    });
  });

  it("deposit shows success message", async () => {
    mocks.balance.mockResolvedValue({ result: 0n });
    mocks.deposit.mockResolvedValue(okTransaction());
    renderEscrowCard(WALLET, "7");

    await waitFor(() => expect(mocks.balance).toHaveBeenCalled());

    const amountInput = screen.getByPlaceholderText("Amount");
    fireEvent.change(amountInput, { target: { value: "5" } });

    fireEvent.click(screen.getByText("Deposit"));

    await waitFor(() => {
      expect(screen.getByText(/Deposited/)).toBeTruthy();
    });
  });

  it("shows connectWalletFirst when wallet is null", async () => {
    renderEscrowCard(null);

    const amountInput = screen.getByPlaceholderText("Amount");
    fireEvent.change(amountInput, { target: { value: "10" } });
    fireEvent.click(screen.getByText("Deposit"));

    expect(screen.getByText("Connect your wallet first.")).toBeTruthy();
  });
});