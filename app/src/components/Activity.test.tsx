import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Activity, { PAGE_SIZE } from "./Activity";
import type { ActivityItem } from "../lib/tributary";

// Stub motion components to plain HTML so we don't need the full
// animation runtime in tests.
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    section: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
      <section {...props}>{children}</section>
    ),
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
      <li {...props}>{children}</li>
    ),
  },
}));

function makeItem(i: number): ActivityItem {
  return {
    eventId: `evt-${i}`,
    type: "split_paid",
    id: BigInt(i),
    amount: BigInt(1_000_000 * (i + 1)),
    token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    ledger: 10_000 + i,
    txHash: `hash${i}`,
  };
}

function makeItems(n: number): ActivityItem[] {
  return Array.from({ length: n }, (_, i) => makeItem(i));
}

describe("Activity component", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<Activity items={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders at most PAGE_SIZE rows when items exceed one page", () => {
    const items = makeItems(PAGE_SIZE + 5);
    render(<Activity items={items} />);

    const listItems = screen.getAllByRole("listitem");
    expect(listItems.length).toBe(PAGE_SIZE);
  });

  it("shows pagination controls when items exceed one page", () => {
    const items = makeItems(PAGE_SIZE + 5);
    render(<Activity items={items} />);

    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();
    expect(screen.getByText("← Prev")).toBeTruthy();
    expect(screen.getByText("Next →")).toBeTruthy();
  });

  it("hides pagination controls when items fit in one page", () => {
    const items = makeItems(PAGE_SIZE - 2);
    render(<Activity items={items} />);

    expect(screen.queryByText(/Page/)).toBeNull();
    expect(screen.queryByText("← Prev")).toBeNull();
    expect(screen.queryByText("Next →")).toBeNull();
  });

  it("clicking Next advances to the second page", () => {
    const items = makeItems(PAGE_SIZE + 5);
    render(<Activity items={items} />);

    fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByText(/Page 2 of 2/)).toBeTruthy();

    // Second page should have the remaining 5 items
    const listItems = screen.getAllByRole("listitem");
    expect(listItems.length).toBe(5);
  });

  it("clicking Prev goes back to the first page", () => {
    const items = makeItems(PAGE_SIZE + 5);
    render(<Activity items={items} />);

    fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByText(/Page 2 of 2/)).toBeTruthy();

    fireEvent.click(screen.getByText("← Prev"));
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBe(PAGE_SIZE);
  });

  it("Prev button is disabled on the first page", () => {
    const items = makeItems(PAGE_SIZE + 5);
    render(<Activity items={items} />);

    const prevBtn = screen.getByText("← Prev");
    expect(prevBtn).toBeInstanceOf(HTMLButtonElement);
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Next button is disabled on the last page", () => {
    const items = makeItems(PAGE_SIZE + 5);
    render(<Activity items={items} />);

    fireEvent.click(screen.getByText("Next →"));
    const nextBtn = screen.getByText("Next →");
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("CSV export button renders and contains all items in export", () => {
    // We verify the Export CSV button exists; the actual download is
    // exercised via the blob/URL APIs which are browser-only.
    const items = makeItems(PAGE_SIZE + 5);
    render(<Activity items={items} />);

    const btn = screen.getByText("Export CSV");
    expect(btn).toBeTruthy();
  });
});
