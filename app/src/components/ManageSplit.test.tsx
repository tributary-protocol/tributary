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
  updateSplit: vi.fn(),
  transferControl: vi.fn(),
  cancelTransfer: vi.fn(),
  pendingController: vi.fn(),
}));

vi.mock("../lib/tributary", () => ({
  walletClient: vi.fn(() => ({
    update_split: mocks.updateSplit,
    transfer_control: mocks.transferControl,
    cancel_transfer: mocks.cancelTransfer,
    pending_controller: mocks.pendingController,
  })),
}));

vi.mock("./FeeHint", () => ({ default: () => null }));

import ManageSplit from "./ManageSplit";

const WALLET = "G".concat("A".repeat(55));
const RECIPIENT_ONE = "G".concat("B".repeat(55));
const RECIPIENT_TWO = "G".concat("C".repeat(55));
const NEW_CONTROLLER = "G".concat("D".repeat(55));

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
      result: { isOk: () => true },
    }),
  };
}

function renderManageSplit(onChanged = vi.fn()) {
  render(
    <I18nProvider>
      <ManageSplit
        wallet={WALLET}
        splits={[SPLIT as never]}
        selectedSplitId="7"
        onChanged={onChanged}
      />
    </I18nProvider>,
  );
  return { onChanged };
}

beforeEach(() => {
  mocks.pendingController.mockResolvedValue({ result: undefined });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ManageSplit controller actions", () => {
  it("validates recipient shares before submitting an update", async () => {
    renderManageSplit();

    const firstShare = await screen.findByLabelText(
      "Recipient 1 share percentage",
    );
    fireEvent.change(firstShare, { target: { value: "90" } });
    fireEvent.click(screen.getByText("Update split"));

    expect(screen.getByText("Shares must add up to 100%.")).toBeTruthy();
    expect(mocks.updateSplit).not.toHaveBeenCalled();
  });

  it("requires a second explicit confirmation before locking", async () => {
    mocks.transferControl.mockResolvedValue(okTransaction());
    const { onChanged } = renderManageSplit();

    fireEvent.click(await screen.findByText("Lock forever"));

    expect(mocks.transferControl).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    fireEvent.click(screen.getByText("Yes, lock it forever"));

    await waitFor(() =>
      expect(mocks.transferControl).toHaveBeenCalledWith({
        id: 7n,
        new_controller: undefined,
      }),
    );
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows a pending transfer and clears it after cancellation", async () => {
    mocks.transferControl.mockResolvedValue(okTransaction());
    mocks.cancelTransfer.mockResolvedValue(okTransaction());
    const { onChanged } = renderManageSplit();

    await waitFor(() => expect(mocks.pendingController).toHaveBeenCalled());
    const controllerInput = screen.getByLabelText("G… new controller");
    fireEvent.change(controllerInput, { target: { value: NEW_CONTROLLER } });
    fireEvent.click(screen.getByText("Propose transfer"));

    await waitFor(() =>
      expect(mocks.transferControl).toHaveBeenCalledWith({
        id: 7n,
        new_controller: NEW_CONTROLLER,
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("GDDD…DDDD");

    fireEvent.click(screen.getByText("Cancel transfer"));

    await waitFor(() =>
      expect(mocks.cancelTransfer).toHaveBeenCalledWith({ id: 7n }),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Transfer proposal cancelled.")).toBeTruthy();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });
});
