/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RefreshError from "./RefreshError";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RefreshError", () => {
  it("renders the error message", () => {
    const error = "Failed to fetch splits";
    render(
      <RefreshError
        error={error}
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText(error)).toBeTruthy();
  });

  it("renders the hint text", () => {
    render(
      <RefreshError
        error="Network error"
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("The app will try again automatically.")).toBeTruthy();
  });

  it("renders the retry button", () => {
    render(
      <RefreshError
        error="Failed"
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("renders the dismiss button", () => {
    render(
      <RefreshError
        error="Failed"
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("✕")).toBeTruthy();
  });

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();
    render(
      <RefreshError
        error="Failed"
        onRetry={onRetry}
        onDismiss={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <RefreshError
        error="Failed"
        onRetry={() => {}}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByText("✕"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("displays the warning icon", () => {
    render(
      <RefreshError
        error="Failed"
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("⚠")).toBeTruthy();
  });
});
