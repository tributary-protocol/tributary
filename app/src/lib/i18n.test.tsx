/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  I18nProvider,
  LANGUAGE_STORAGE_KEY,
  persistLanguage,
  readSavedLanguage,
  useTranslation,
} from "./i18n";
import LanguageSwitcher from "../components/LanguageSwitcher";

function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      store = {};
    },
    key(_index: number) {
      return null;
    },
    get length() {
      return Object.keys(store).length;
    },
  } as unknown as Storage;
}

function TestTranslationConsumer() {
  const { language, setLanguage, t } = useTranslation();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="translation">{t("connectWallet")}</span>
      <button onClick={() => setLanguage("vi")}>vi</button>
      <button onClick={() => setLanguage("en")}>en</button>
    </div>
  );
}

describe("i18n persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to English when no saved locale exists", () => {
    expect(readSavedLanguage()).toBe("en");
  });

  it("falls back to English for an invalid saved locale", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");
    expect(readSavedLanguage()).toBe("en");
  });

  it("reads a saved locale from localStorage (tr)", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "tr");
    expect(readSavedLanguage()).toBe("tr");
  });

  it("reads a saved locale from localStorage (vi)", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "vi");
    expect(readSavedLanguage()).toBe("vi");
  });

  it("reads a saved locale from localStorage (it)", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "it");
    expect(readSavedLanguage()).toBe("it");
  });

  it("reads a saved locale from localStorage (tr)", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "tr");
    expect(readSavedLanguage()).toBe("tr");
  });

  it("persists locale selection directly", () => {
    persistLanguage("vi");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("vi");
  });

  it("updates localStorage when the user changes language through the provider", () => {
    render(
      <I18nProvider>
        <TestTranslationConsumer />
      </I18nProvider>,
    );

    expect(screen.getByTestId("language").textContent).toBe("en");
    expect(screen.getByTestId("translation").textContent).toBe("Connect Freighter");

    fireEvent.click(screen.getByText("vi"));

    expect(screen.getByTestId("language").textContent).toBe("vi");
    expect(screen.getByTestId("translation").textContent).toBe("Kết nối Freighter");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("vi");
  });

  it("persists locale when the LanguageSwitcher select changes", () => {
    render(
      <I18nProvider>
        <LanguageSwitcher />
      </I18nProvider>,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("en");

    fireEvent.change(select, { target: { value: "vi" } });

    expect(select.value).toBe("vi");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("vi");
  });
});
