/** Пользователь печатает: горячие клавиши не должны срабатывать. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
  );
}

/** Фокус на кнопке или ссылке: Enter и пробел должны нажимать её, а не делать что-то другое. */
export function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('a, button, input, select, textarea, summary, [contenteditable="true"]') !== null;
}
