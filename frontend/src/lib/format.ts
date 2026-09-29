const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Склонение: plural(5, ['день', 'дня', 'дней']) → 'дней'. */
export function plural(n: number, forms: [one: string, few: string, many: string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (!Number.isInteger(n)) return forms[1];
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function formatDays(n: number): string {
  return `${n} ${plural(n, ['день', 'дня', 'дней'])}`;
}
