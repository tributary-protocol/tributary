/** @vitest-environment jsdom */
// Every literal key the app passes to t() must exist in the English table. t() returns the
// key itself when it finds nothing, so a missing key does not fail anything: it just renders
// "duplicateRecipientNote" to the user. This scans the source instead of a hand-kept list,
// because the list is exactly what goes stale.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider, LANGUAGE_STORAGE_KEY, translations, useTranslation } from "./i18n";

// __dirname rather than import.meta.url: under jsdom the latter is not a file: URL.
const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function literalKeys(): string[] {
  const keys = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    // Only a whole literal, t("key") or t("key", {...}): t("tab" + tabItem) is built at runtime.
    for (const match of readFileSync(file, "utf-8").matchAll(/\bt\(\s*["'](\w+)["']\s*[,)]/g)) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

function Translate({ keys }: { keys: string[] }) {
  const { t } = useTranslation();
  return (
    <ul>
      {keys.map((key) => (
        <li key={key} data-testid={key}>
          {t(key)}
        </li>
      ))}
    </ul>
  );
}

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("i18n keys", () => {
  it("finds the keys it is meant to check", () => {
    // Guards the scanner itself: an empty result would make the next test pass vacuously.
    // t("tab" + tabItem) in ActionPanel is built at runtime, so it is not a literal key.
    const keys = literalKeys();
    expect(keys).toEqual(expect.arrayContaining(["connectWallet", "duplicateRecipientNote"]));
    expect(keys).not.toContain("tab");
  });

  it("has an English string for every literal key the app uses", () => {
    const missing = literalKeys().filter((key) => !(key in translations.en));
    expect(missing).toEqual([]);
  });

  it("falls back to English for a key a locale has not translated", () => {
    // importCsv has no Russian entry yet.
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ru");
    render(
      <I18nProvider>
        <Translate keys={["importCsv", "connectWallet"]} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("importCsv").textContent).toBe("Import CSV");
    // A key the locale does have is still served in that locale.
    expect(screen.getByTestId("connectWallet").textContent).not.toBe("Connect Freighter");
  });
});
