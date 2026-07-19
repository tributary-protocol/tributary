// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

/* A component that throws on first render, then works after reset. */
let shouldThrow = true;
function Thrower() {
  if (shouldThrow) {
    throw new Error("test render explosion");
  }
  return <p>recovered</p>;
}

function Good() {
  return <p>all good</p>;
}

beforeEach(() => {
  shouldThrow = true;
});

afterEach(() => {
  cleanup();
});

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <Good />
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeDefined();
  });

  it("shows fallback UI when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.getByText("test render explosion")).toBeDefined();
    expect(screen.getByText("Try again")).toBeDefined();
    expect(screen.getByText("Refresh page")).toBeDefined();

    spy.mockRestore();
  });

  it("resets and re-renders children when 'Try again' is clicked", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();

    // Stop throwing so the next render succeeds
    shouldThrow = false;
    fireEvent.click(screen.getByText("Try again"));

    expect(screen.getByText("recovered")).toBeDefined();

    spy.mockRestore();
  });

  it("logs the error via console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    const boundaryCall = spy.mock.calls.find(
      (call) => call[0] === "ErrorBoundary caught an error:",
    );
    expect(boundaryCall).toBeDefined();

    spy.mockRestore();
  });
});
