import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePagination } from "./usePagination";

function makeItems(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

describe("usePagination", () => {
  it("returns the first page of items", () => {
    const items = makeItems(25);
    const { result } = renderHook(() => usePagination(items, 10));

    expect(result.current.page).toEqual(items.slice(0, 10));
    expect(result.current.pageIndex).toBe(0);
    expect(result.current.pageCount).toBe(3);
  });

  it("next() advances to the next page", () => {
    const items = makeItems(25);
    const { result } = renderHook(() => usePagination(items, 10));

    act(() => result.current.next());
    expect(result.current.pageIndex).toBe(1);
    expect(result.current.page).toEqual(items.slice(10, 20));
  });

  it("prev() goes back to the previous page", () => {
    const items = makeItems(25);
    const { result } = renderHook(() => usePagination(items, 10));

    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.pageIndex).toBe(2);

    act(() => result.current.prev());
    expect(result.current.pageIndex).toBe(1);
  });

  it("prev() is a no-op on the first page", () => {
    const items = makeItems(5);
    const { result } = renderHook(() => usePagination(items, 10));

    act(() => result.current.prev());
    expect(result.current.pageIndex).toBe(0);
  });

  it("next() is a no-op on the last page", () => {
    const items = makeItems(15);
    const { result } = renderHook(() => usePagination(items, 10));

    act(() => result.current.next());
    expect(result.current.pageIndex).toBe(1);
    // Already on last page
    act(() => result.current.next());
    expect(result.current.pageIndex).toBe(1);
  });

  it("setPage() jumps to arbitrary page, clamped", () => {
    const items = makeItems(30);
    const { result } = renderHook(() => usePagination(items, 10));

    act(() => result.current.setPage(2));
    expect(result.current.pageIndex).toBe(2);
    expect(result.current.page).toEqual(items.slice(20, 30));

    // Clamp to last page
    act(() => result.current.setPage(99));
    expect(result.current.pageIndex).toBe(2);

    // Clamp to first page
    act(() => result.current.setPage(-5));
    expect(result.current.pageIndex).toBe(0);
  });

  it("clamps page index when items shrink", () => {
    let items = makeItems(30);
    const { result, rerender } = renderHook(
      ({ items: hookItems }) => usePagination(hookItems, 10),
      { initialProps: { items } },
    );

    act(() => result.current.setPage(2));
    expect(result.current.pageIndex).toBe(2);

    // Shrink the list — same reference won't trigger reset, but clamping
    // must kick in.  We mutate to a new array with same identity trick:
    items = makeItems(12);
    rerender({ items });
    expect(result.current.pageIndex).toBeLessThanOrEqual(1);
  });

  it("returns pageCount 1 for a single page", () => {
    const items = makeItems(5);
    const { result } = renderHook(() => usePagination(items, 10));

    expect(result.current.pageCount).toBe(1);
    expect(result.current.page).toEqual(items);
  });

  it("handles empty items", () => {
    const { result } = renderHook(() => usePagination([], 10));

    expect(result.current.page).toEqual([]);
    expect(result.current.pageIndex).toBe(0);
    expect(result.current.pageCount).toBe(1);
  });

  it("resets to page 0 when items reference changes", () => {
    let items = makeItems(30);
    const { result, rerender } = renderHook(
      ({ items: hookItems }) => usePagination(hookItems, 10),
      { initialProps: { items } },
    );

    act(() => result.current.setPage(2));
    expect(result.current.pageIndex).toBe(2);

    // New data arrives — different array reference
    items = makeItems(30);
    rerender({ items });
    expect(result.current.pageIndex).toBe(0);
  });
});
