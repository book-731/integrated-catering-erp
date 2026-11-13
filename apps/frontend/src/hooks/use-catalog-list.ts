import { useCallback, useEffect, useState } from 'react';
import { getCategories, type CatalogQuery, type Paged, type Category } from '../api/catalog';
export function useCatalogList<T>(
  fetcher: (query: CatalogQuery, signal?: AbortSignal) => Promise<Paged<T>>,
  query: CatalogQuery,
) {
  const [data, setData] = useState<Paged<T>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetcher(query, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      },
      (failure) => {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : '資料載入失敗。');
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [fetcher, query, attempt]);
  return { ...data, loading, error, reload };
}
export function useCategoryOptions() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const first = await getCategories(
          { q: '', isActive: '', page: 1, pageSize: 100 },
          controller.signal,
        );
        const all = [...first.items];
        const pages = Math.ceil(first.total / 100);
        for (let page = 2; page <= pages; page++) {
          const next = await getCategories(
            { q: '', isActive: '', page, pageSize: 100 },
            controller.signal,
          );
          all.push(...next.items);
        }
        if (!controller.signal.aborted) {
          setItems([...new Map(all.map((item) => [item.id, item])).values()]);
          setLoading(false);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : '分類載入失敗。');
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [attempt]);
  return { items, loading, error, reload: () => setAttempt((value) => value + 1) };
}
