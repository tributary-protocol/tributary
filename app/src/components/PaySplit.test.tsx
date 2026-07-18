import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import PaySplit from "./PaySplit";
import { I18nProvider } from "../lib/i18n";
import * as tributary from "../lib/tributary";

vi.mock("../lib/tributary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/tributary")>();
  return {
    ...actual,
    previewPayout: vi.fn(),
    walletClient: vi.fn(),
  };
});

const mockSplits: tributary.SplitView[] = [
  {
    id: 1n,
    recipients: [
      { tag: "Account", values: ["GBNDO67PZ22T7A3P7NZD3PHX7CXT6UOBY3NGAQ2I3Z6V7233I2YJUXO6"] },
      { tag: "Account", values: ["GDE4Z4JCO5O6Z77R24N6S3S327N2X627P6S3S327N2X627P6S3S327N2"] },
    ],
    shares: [60, 40],
    controller: "GBNDO67PZ22T7A3P7NZD3PHX7CXT6UOBY3NGAQ2I3Z6V7233I2YJUXO6",
  },
];

describe("PaySplit - Confirmation Dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("requires wallet connection and split selection to proceed", async () => {
    render(
      <I18nProvider>
        <PaySplit wallet={null} splits={mockSplits} onPaid={() => {}} />
      </I18nProvider>
    );

    // Click pay without wallet or inputs
    const payBtn = screen.getByRole("button", { name: /Pay/i }) as HTMLButtonElement;
    expect(payBtn.disabled).toBe(true);
  });

  it("opens confirmation dialog with breakdown on clicking pay", async () => {
    vi.mocked(tributary.previewPayout).mockResolvedValue([60000000n, 40000000n]);

    const { container } = render(
      <I18nProvider>
        <PaySplit wallet="GBNDO67PZ22T7A3P7NZD3PHX7CXT6UOBY3NGAQ2I3Z6V7233I2YJUXO6" splits={mockSplits} onPaid={() => {}} />
      </I18nProvider>
    );

    // Select split using select option
    const select = container.querySelector("select:not(.kind)") as HTMLSelectElement;
    expect(select).not.toBeNull();
    fireEvent.change(select, { target: { value: "1" } });

    // Enter amount
    const input = screen.getByPlaceholderText(/Amount/i);
    fireEvent.change(input, { target: { value: "10" } });

    // Wait for preview to be called and page to render preview
    await waitFor(() => {
      expect(tributary.previewPayout).toHaveBeenCalledWith(1n, 100_000_000n);
    });

    const payBtn = screen.getByRole("button", { name: /Pay/i }) as HTMLButtonElement;
    expect(payBtn.disabled).toBe(false);
    
    // Dialog should not be visible initially
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();

    // Click pay
    fireEvent.click(payBtn);

    // Dialog should now be visible
    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog).not.toBeNull();

    // Check title and description
    expect(screen.getByText(/Confirm Payment/i)).not.toBeNull();
    expect(screen.getByText(/Please review the payment details before signing./i)).not.toBeNull();

    // Verify per-recipient breakdown inside confirmation dialog
    expect(screen.getAllByText("GBND…UXO6").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GDE4…27N2").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6 XLM/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4 XLM/i).length).toBeGreaterThan(0);
  });

  it("closes dialog and does not submit when cancel is clicked", async () => {
    vi.mocked(tributary.previewPayout).mockResolvedValue([60000000n, 40000000n]);

    const { container } = render(
      <I18nProvider>
        <PaySplit wallet="GBNDO67PZ22T7A3P7NZD3PHX7CXT6UOBY3NGAQ2I3Z6V7233I2YJUXO6" splits={mockSplits} onPaid={() => {}} />
      </I18nProvider>
    );

    // Select split and enter amount
    const select = container.querySelector("select:not(.kind)") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "1" } });
    fireEvent.change(screen.getByPlaceholderText(/Amount/i), { target: { value: "10" } });

    await waitFor(() => {
      expect(tributary.previewPayout).toHaveBeenCalled();
    });

    // Click pay
    fireEvent.click(screen.getByRole("button", { name: /Pay/i }));
    expect(screen.getByTestId("confirm-dialog")).not.toBeNull();

    // Click cancel
    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    // Dialog should be gone
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(tributary.walletClient).not.toHaveBeenCalled();
  });

  it("submits payment when confirm & pay is clicked", async () => {
    vi.mocked(tributary.previewPayout).mockResolvedValue([60000000n, 40000000n]);

    const signAndSendMock = vi.fn().mockResolvedValue({
      result: {
        isOk: () => true,
      },
    });

    const payMock = vi.fn().mockResolvedValue({
      signAndSend: signAndSendMock,
    });

    vi.mocked(tributary.walletClient).mockReturnValue({
      pay: payMock,
    } as any);

    const onPaidMock = vi.fn();

    const { container } = render(
      <I18nProvider>
        <PaySplit
          wallet="GBNDO67PZ22T7A3P7NZD3PHX7CXT6UOBY3NGAQ2I3Z6V7233I2YJUXO6"
          splits={mockSplits}
          onPaid={onPaidMock}
        />
      </I18nProvider>
    );

    // Select split and enter amount
    const select = container.querySelector("select:not(.kind)") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "1" } });
    fireEvent.change(screen.getByPlaceholderText(/Amount/i), { target: { value: "10" } });

    await waitFor(() => {
      expect(tributary.previewPayout).toHaveBeenCalled();
    });

    // Click pay
    fireEvent.click(screen.getByRole("button", { name: /Pay/i }));

    // Click Confirm & Pay
    const confirmBtn = screen.getByRole("button", { name: /Confirm & Pay/i });
    fireEvent.click(confirmBtn);

    // Dialog should close immediately
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();

    // Verify wallet payment calls
    expect(tributary.walletClient).toHaveBeenCalledWith("GBNDO67PZ22T7A3P7NZD3PHX7CXT6UOBY3NGAQ2I3Z6V7233I2YJUXO6");
    expect(payMock).toHaveBeenCalledWith({
      from: "GBNDO67PZ22T7A3P7NZD3PHX7CXT6UOBY3NGAQ2I3Z6V7233I2YJUXO6",
      id: 1n,
      token: tributary.TOKENS[0].contract,
      amount: 100_000_000n,
    });

    await waitFor(() => {
      expect(onPaidMock).toHaveBeenCalled();
      expect(screen.getByText(/Paid 10 XLM through split #1./i)).not.toBeNull();
    });
  });
});
