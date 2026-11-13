import { useCallback, useEffect, useRef, useState } from 'react';
import { getHealth, type HealthResponse } from '../api/health';
import { ApiClientError } from '../api/client';
type HealthState =
  | { status: 'loading' }
  | { status: 'success'; response: HealthResponse }
  | { status: 'error'; error: ApiClientError };

export function useHealth() {
  const [state, setState] = useState<HealthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState({ status: 'loading' });
    void getHealth(controller.signal).then(
      (response) => {
        if (!controller.signal.aborted) setState({ status: 'success', response });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({
            status: 'error',
            error:
              error instanceof ApiClientError
                ? error
                : new ApiClientError('連線檢查失敗。', 'UNKNOWN_ERROR', 0),
          });
      },
    );
    return () => controller.abort();
  }, [attempt]);
  return { state, refresh };
}
