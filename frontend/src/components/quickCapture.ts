import { createContext, useContext } from 'react';

/** Открыть окно быстрой записи из любого места: кнопка, «+» на телефоне, клавиша N. */
export const QuickCaptureContext = createContext<() => void>(() => {});

export function useQuickCapture(): () => void {
  return useContext(QuickCaptureContext);
}
