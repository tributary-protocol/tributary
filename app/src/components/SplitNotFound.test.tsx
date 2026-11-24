/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "../lib/i18n";
import { BrowserRouter } from "react-router-dom";
import SplitNotFound from "./SplitNotFound";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSplitNotFound(id: string) {
  return render(
    <I18nProvider>
      <BrowserRouter>
        <SplitNotFound id={id} />
      </BrowserRouter>
    </I18nProvider>,
  );
}

describe("SplitNotFound", () => {
  it("renders a 404 badge", () => {
    renderSplitNotFound("42");
    expect(screen.getByText("404")).toBeTruthy();
  });

  it("renders the heading", () => {
    renderSplitNotFound("42");
    expect(screen.getByText("Split not found")).toBeTruthy();
  });

  it("shows the split id in the message", () => {
    renderSplitNotFound("99");
    expect(screen.getByText(/#99/)).toBeTruthy();
  });

  it("shows a back link to the dashboard", () => {
    renderSplitNotFound("42");
    const link = screen.getByText("Back to the list");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/");
  });

  it("handles the string 'unknown' as an id", () => {
    renderSplitNotFound("unknown");
    expect(screen.getByText(/#unknown/)).toBeTruthy();
  });
});
