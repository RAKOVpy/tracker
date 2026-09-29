/** Сохраняет текст в файл через скачивание. */
export function downloadText(text: string, filename: string, type = 'text/plain'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Firefox отменяет скачивание, если ссылку отозвать сразу после клика.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
