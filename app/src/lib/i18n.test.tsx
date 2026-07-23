/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  I18nProvider,
  LANGUAGE_STORAGE_KEY,
  isRtl,
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
  const { language, setLanguage, t, isRtl: isRtlProp, dir } = useTranslation();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="translation">{t("connectWallet")}</span>
      <span data-testid="isRtl">{String(isRtlProp)}</span>
      <span data-testid="dir">{dir}</span>
      <button onClick={() => setLanguage("vi")}>vi</button>
      <button onClick={() => setLanguage("en")}>en</button>
      <button onClick={() => setLanguage("ar")}>ar</button>
    </div>
  );
}

describe("i18n persistence and RTL support", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    localStorage.clear();
    document.documentElement.dir = "ltr";
    document.documentElement.lang = "en";
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

  it("reads a saved locale from localStorage (ru)", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ru");
    expect(readSavedLanguage()).toBe("ru");
  });

  it("reads a saved locale from localStorage (ja)", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ja");
    expect(readSavedLanguage()).toBe("ja");
  });

  it("reads a saved locale from localStorage (ar)", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");
    expect(readSavedLanguage()).toBe("ar");
  });

  it("identifies RTL languages correctly with isRtl helper", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isRtl("ja")).toBe(false);
    expect(isRtl("vi")).toBe(false);
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

  it("translates strings into Arabic and updates document dir to RTL", () => {
    render(
      <I18nProvider>
        <TestTranslationConsumer />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByText("ar"));

    expect(screen.getByTestId("language").textContent).toBe("ar");
    expect(screen.getByTestId("translation").textContent).toBe("ربط محفظة Freighter");
    expect(screen.getByTestId("isRtl").textContent).toBe("true");
    expect(screen.getByTestId("dir").textContent).toBe("rtl");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ar");

    fireEvent.click(screen.getByText("en"));
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
  });

  it("persists locale when the LanguageSwitcher select changes", () => {
    render(
      <I18nProvider>
        <LanguageSwitcher />
      </I18nProvider>,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("en");

    fireEvent.change(select, { target: { value: "ja" } });

    expect(select.value).toBe("ja");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ja");
  });

  it("persists locale and sets RTL dir when LanguageSwitcher changes to Arabic", () => {
    render(
      <I18nProvider>
        <LanguageSwitcher />
      </I18nProvider>,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "ar" } });

    expect(select.value).toBe("ar");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });
});
