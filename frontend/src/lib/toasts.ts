import { useSyncExternalStore } from 'react';

/** Короткие сообщения поверх экрана: «не сохранилось», «нет связи». */
export interface Toast {
  id: number;
  text: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Одно и то же сообщение не дублируется, а показывается заново; одновременно — не больше трёх. */
export function showToast(text: string): void {
  toasts = [...toasts.filter((t) => t.text !== text), { id: nextId++, text }].slice(-3);
  emit();
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts);
}
