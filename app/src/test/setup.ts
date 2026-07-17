import "@testing-library/jest-dom";
import { vi } from "vitest";

// Provide a lightweight useTranslation mock so components that call
// useTranslation() work in tests without needing an I18nProvider.
// The mock returns English strings from the real translation table.
vi.mock("../lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/i18n")>();
  const en: Record<string, string> = {
    escrowTitle: "Escrow",
    escrowDesc: "Park funds in a split now, pay everyone out later.",
    chooseSplit: "Choose split",
    recipientsCount: "{count} recipients",
    pending: "Pending: {amount} {token}",
    distributeButton: "Distribute",
    depositButton: "Deposit",
    working: "Working…",
    distributeSuccess: "Distributed {amount} {token} to all recipients.",
    distributeFailed: "Nothing to distribute.",
    depositSuccess: "Deposited {amount} {token}.",
    depositFailed: "Deposit failed.",
    connectWalletFirst: "Connect your wallet first.",
    pickSplitAndAmount: "Pick a split and an amount.",
    amount: "Amount",
  };
  function t(key: string, vars?: Record<string, string | number>): string {
    let text = en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }
  return {
    ...actual,
    useTranslation: () => ({ t, language: "en", setLanguage: vi.fn() }),
    I18nProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
