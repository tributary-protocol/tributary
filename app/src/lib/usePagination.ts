import { useCallback, useMemo, useState, useRef, useEffect } from "react";

export interface PaginationResult<T> {
  /** Items on the current page. */
  page: T[];
  /** Zero-based index of the current page. */
  pageIndex: number;
  /** Total number of pages (≥ 1). */
  pageCount: number;
  /** Jump to an arbitrary page (clamped to valid range). */
  setPage: (n: number) => void;
  /** Advance to the next page (no-op on last page). */
  next: () => void;
  /** Go back to the previous page (no-op on first page). */
  prev: () => void;
}

/**
 * Generic client-side pagination hook.
 *
 * Resets to page 0 whenever the `items` array reference changes (new data
 * fetch).  Automatically clamps `pageIndex` if the array shrinks.
 */
export function usePagination<T>(
  items: T[],
  pageSize: number,
): PaginationResult<T> {
  const [pageIndex, setPageIndex] = useState(0);

  // Reset to first page when the items array identity changes.
  const prevRef = useRef(items);
  useEffect(() => {
    if (items !== prevRef.current) {
      prevRef.current = items;
      setPageIndex(0);
    }
  }, [items]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // Clamp so we never point past the last page.
  const clamped = Math.min(pageIndex, pageCount - 1);
  if (clamped !== pageIndex) {
    // Synchronous correction keeps derived state consistent within the
    // same render — React batches the setState.
    setPageIndex(clamped);
  }

  const page = useMemo(
    () => items.slice(clamped * pageSize, clamped * pageSize + pageSize),
    [items, clamped, pageSize],
  );

  const setPage = useCallback(
    (n: number) => setPageIndex(Math.max(0, Math.min(n, pageCount - 1))),
    [pageCount],
  );

  const next = useCallback(
    () => setPageIndex((i) => Math.min(i + 1, pageCount - 1)),
    [pageCount],
  );

  const prev = useCallback(
    () => setPageIndex((i) => Math.max(i - 1, 0)),
    [pageCount],
  );

  return { page, pageIndex: clamped, pageCount, setPage, next, prev };
}
