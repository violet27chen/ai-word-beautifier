'use client';

import { useEffect } from 'react';

const RELOAD_GUARD_KEY = 'chunk_error_auto_reloaded_once';

function isChunkLoadFailure(message: string) {
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /_next\/static\/chunks/i.test(message)
  );
}

export default function ChunkErrorAutoReload() {
  useEffect(() => {
    const tryReload = () => {
      if (sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') {
        return;
      }
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      window.location.reload();
    };

    const onWindowError = (event: ErrorEvent) => {
      const message = String(event.message || '');
      if (isChunkLoadFailure(message)) {
        tryReload();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === 'string'
          ? reason
          : String((reason && (reason.message || reason.stack)) || '');
      if (isChunkLoadFailure(message)) {
        tryReload();
      }
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
