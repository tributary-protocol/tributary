import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EscrowCard from "../components/EscrowCard";
import type { SplitView } from "../lib/tributary";

// ── hoisted mocks (evaluated before vi.mock factories) ─────────────────────

const {
  mockFetchHeldTokens,
  mockReadClientBalance,
  mockWalletClientDistribute,
  mockWalletClientDeposit,
} = vi.hoisted(() => ({
  mockFetchHeldTokens: vi.fn<[bigint], Promise<string[]>>(),
  mockReadClientBalance: vi.fn(),
  mockWalletClientDistribute: vi.fn(),
  mockWalletClientDeposit: vi.fn(),
}));

vi.mock("../lib/tributary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/tributary")>();
  return {
    ...actual,
    fetchHeldTokens: mockFetchHeldTokens,
    readClient: () => ({
      balance: mockReadClientBalance,
    }),
    walletClient: () => ({
      distribute: mockWalletClientDistribute,
      deposit: mockWalletClientDeposit,
    }),
  };
});

// ── constants ─────────────────────────────────────────────────────────────

const XLM = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

const SPLITS: SplitView[] = [
  {
    id: 1n,
    recipients: [
      { tag: "Account", values: ["GABC"] },
      { tag: "Account", values: ["GDEF"] },
    ],
    shares: [5000, 5000],
    controller: undefined,
  },
];

// ── helpers ───────────────────────────────────────────────────────────────

/** The EscrowCard renders two <select> elements: split-picker and TokenPicker.
 *  This helper always returns the first one (split picker). */
function splitPicker() {
  return screen.getAllByRole("combobox")[0];
}

function makeDistributeResult(amount: bigint) {
  return Promise.resolve({
    signAndSend: () =>
      Promise.resolve({
        result: {
          isOk: () => true,
          unwrap: () => amount,
        },
      }),
  });
}

// ── tests ─────────────────────────────────────────────────────────────────

describe("EscrowCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'No pending balances' when escrow is empty", async () => {
    mockFetchHeldTokens.mockResolvedValue([]);

    render(<EscrowCard wallet="GUSER" splits={SPLITS} />);

    await userEvent.selectOptions(splitPicker(), "1");

    await waitFor(() => {
      expect(screen.getByText("No pending balances.")).toBeInTheDocument();
    });
  });

  it("displays a balance row for each held token", async () => {
    mockFetchHeldTokens.mockResolvedValue([XLM, USDC]);
    mockReadClientBalance
      .mockResolvedValueOnce({ result: 50_000_000n }) // 5 XLM
      .mockResolvedValueOnce({ result: 200_000_000n }); // 20 USDC

    render(<EscrowCard wallet="GUSER" splits={SPLITS} />);

    await userEvent.selectOptions(splitPicker(), "1");

    await waitFor(() => {
      expect(screen.getByText(/5.*XLM/)).toBeInTheDocument();
      expect(screen.getByText(/20.*USDC/)).toBeInTheDocument();
    });
  });

  it("renders a Distribute button for each held token", async () => {
    mockFetchHeldTokens.mockResolvedValue([XLM, USDC]);
    mockReadClientBalance
      .mockResolvedValueOnce({ result: 10_000_000n })
      .mockResolvedValueOnce({ result: 5_000_000n });

    render(<EscrowCard wallet="GUSER" splits={SPLITS} />);

    await userEvent.selectOptions(splitPicker(), "1");

    await waitFor(() => {
      const distributeButtons = screen
        .getAllByRole("button")
        .filter((b) => b.textContent === "Distribute");
      expect(distributeButtons).toHaveLength(2);
    });
  });

  it("calls distribute with the correct token and refreshes balances after", async () => {
    mockFetchHeldTokens
      .mockResolvedValueOnce([XLM]) // initial load
      .mockResolvedValueOnce([]); // after distribute

    mockReadClientBalance.mockResolvedValueOnce({ result: 10_000_000n });

    mockWalletClientDistribute.mockResolvedValue(
      makeDistributeResult(10_000_000n),
    );

    render(<EscrowCard wallet="GUSER" splits={SPLITS} />);

    await userEvent.selectOptions(splitPicker(), "1");

    await waitFor(() => {
      expect(screen.getByText(/1.*XLM/)).toBeInTheDocument();
    });

    const distributeBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "Distribute")!;

    await userEvent.click(distributeBtn);

    expect(mockWalletClientDistribute).toHaveBeenCalledWith({
      id: 1n,
      token: XLM,
    });

    await waitFor(() => {
      expect(screen.getByText("No pending balances.")).toBeInTheDocument();
    });
  });

  it("shows a success message after distribution", async () => {
    mockFetchHeldTokens
      .mockResolvedValueOnce([XLM]) // initial load
      .mockResolvedValue([]); // post-distribute refresh

    mockReadClientBalance.mockResolvedValue({ result: 10_000_000n });
    mockWalletClientDistribute.mockResolvedValue(
      makeDistributeResult(10_000_000n),
    );

    render(<EscrowCard wallet="GUSER" splits={SPLITS} />);

    await userEvent.selectOptions(splitPicker(), "1");

    await waitFor(() =>
      expect(
        screen.getAllByRole("button").find((b) => b.textContent === "Distribute"),
      ).toBeTruthy(),
    );

    await userEvent.click(
      screen
        .getAllByRole("button")
        .find((b) => b.textContent === "Distribute")!,
    );

    await waitFor(() => {
      expect(screen.getByText(/Distributed.*XLM/)).toBeInTheDocument();
    });
  });

  it("shows a load-error message when fetchHeldTokens rejects", async () => {
    mockFetchHeldTokens.mockRejectedValue(new Error("network error"));

    render(<EscrowCard wallet="GUSER" splits={SPLITS} />);

    await userEvent.selectOptions(splitPicker(), "1");

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load pending balances."),
      ).toBeInTheDocument();
    });
  });

  it("shows a distribute error message when the transaction rejects", async () => {
    mockFetchHeldTokens.mockResolvedValue([XLM]);
    mockReadClientBalance.mockResolvedValue({ result: 10_000_000n });
    mockWalletClientDistribute.mockRejectedValue(new Error("tx rejected"));

    render(<EscrowCard wallet="GUSER" splits={SPLITS} />);

    await userEvent.selectOptions(splitPicker(), "1");

    await waitFor(() =>
      expect(
        screen.getAllByRole("button").find((b) => b.textContent === "Distribute"),
      ).toBeTruthy(),
    );

    await userEvent.click(
      screen
        .getAllByRole("button")
        .find((b) => b.textContent === "Distribute")!,
    );

    await waitFor(() => {
      expect(screen.getByText("tx rejected")).toBeInTheDocument();
    });
  });

  it("filters out zero-balance tokens returned by held_tokens", async () => {
    mockFetchHeldTokens.mockResolvedValue([XLM, USDC]);
    mockReadClientBalance
      .mockResolvedValueOnce({ result: 5_000_000n }) // XLM: 0.5
      .mockResolvedValueOnce({ result: 0n }); // USDC: 0 (stale)

    render(<EscrowCard wallet="GUSER" splits={SPLITS} />);

    await userEvent.selectOptions(splitPicker(), "1");

    await waitFor(() => {
      // Only XLM balance row should appear (1 Distribute button)
      const distributeButtons = screen
        .getAllByRole("button")
        .filter((b) => b.textContent === "Distribute");
      expect(distributeButtons).toHaveLength(1);
      // The balance rows should contain XLM but not USDC
      const pendingTexts = screen.getAllByText(/XLM/);
      // At least one match should be in the escrow-balances section (a span), not just the token picker option
      const inBalanceSection = pendingTexts.some(
        (el) => el.closest(".escrow-balances") !== null,
      );
      expect(inBalanceSection).toBe(true);
    });
  });

  it("calls deposit and refreshes balance list on success", async () => {
    mockFetchHeldTokens
      .mockResolvedValueOnce([]) // initial
      .mockResolvedValueOnce([XLM]); // after deposit

    mockReadClientBalance.mockResolvedValue({ result: 10_000_000n });

    mockWalletClientDeposit.mockResolvedValue({
      signAndSend: () =>
        Promise.resolve({
          result: { isOk: () => true },
        }),
    });

    render(<EscrowCard wallet="GUSER" splits={SPLITS} />);

    await userEvent.selectOptions(splitPicker(), "1");
    await userEvent.type(screen.getByPlaceholderText("Amount"), "1");

    await userEvent.click(
      screen.getAllByRole("button").find((b) => b.textContent === "Deposit")!,
    );

    await waitFor(() => {
      expect(screen.getByText(/Deposited/)).toBeInTheDocument();
    });

    // fetchHeldTokens was called twice: initial load + after deposit
    expect(mockFetchHeldTokens).toHaveBeenCalledTimes(2);
  });
});
