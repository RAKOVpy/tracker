import { onlineManager } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { serverMode } from '../api';

function useOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  );
}

/**
 * Без интернета изменения ждут связи в памяти вкладки и уходят на сервер сами, когда она вернётся
 * (так устроены запросы TanStack Query в режиме networkMode: 'online').
 */
export function OfflineNotice() {
  const online = useOnline();
  if (!serverMode || online) return null;
  return (
    <p className="notice notice--warn offline" role="status">
      <WifiOff size={16} aria-hidden /> Нет интернета. Изменения сохранятся, когда связь вернётся, — не закрывайте вкладку.
    </p>
  );
}
