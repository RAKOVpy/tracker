import { CircleAlert, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { dismissToast, useToasts, type Toast } from '../lib/toasts';

const SHOW_MS = 8000;

function ToastItem({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <div className="toast" role="alert">
      <CircleAlert size={18} aria-hidden className="toast__icon" />
      <p className="toast__text">{toast.text}</p>
      <button type="button" className="icon-btn toast__close" aria-label="Закрыть" onClick={() => dismissToast(toast.id)}>
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Сообщения об ошибках сохранения. Слой — «всплывающий» (popover): так сообщение видно и поверх
 * открытого окна быстрой записи.
 */
export function Toasts() {
  const toasts = useToasts();
  const layer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = layer.current;
    if (!element || typeof element.showPopover !== 'function') return;
    try {
      // Заново открытый слой оказывается поверх окон, открытых после него.
      if (element.matches(':popover-open')) element.hidePopover();
      if (toasts.length > 0) element.showPopover();
    } catch {
      // Браузер без поддержки popover показывает слой как обычный блок.
    }
  }, [toasts]);

  return (
    <div ref={layer} className="toasts" popover="manual" aria-live="assertive">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
