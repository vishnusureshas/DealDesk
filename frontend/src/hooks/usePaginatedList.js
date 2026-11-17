import { useCallback, useEffect, useRef, useState } from 'react';

export function usePaginatedList(fetchPage, deps = []) {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetchPage);
  fetcherRef.current = fetchPage;
  const requestId = useRef(0);

  const load = useCallback(async (cursor, append) => {
    const id = requestId.current + 1;
    requestId.current = id;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const page = await fetcherRef.current(cursor);

      if (requestId.current !== id) return;

      setItems((previous) =>
        append ? [...previous, ...page.items] : page.items,
      );
      setNextCursor(page.nextCursor ?? null);
      setError(null);
    } catch (loadError) {
      if (requestId.current === id) setError(loadError);
    } finally {
      if (requestId.current === id) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    // Filters changed: drop the previous page so stale rows never mix with
    // the new cursor chain.
    setItems([]);
    setNextCursor(null);
    load(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    items,
    nextCursor,
    loading,
    loadingMore,
    error,
    refresh: () => load(null, false),
    loadMore: () => {
      if (nextCursor) load(nextCursor, true);
    },
  };
}
