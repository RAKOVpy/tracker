/** Ссылка, по которой Obsidian откроет файл. */
export function obsidianUri(vaultName: string, path: string): string {
  const file = path.replace(/\.md$/i, '');
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`;
}
