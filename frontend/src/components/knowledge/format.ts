import { BookOpen, FileText, GraduationCap, Presentation, Shapes, Video, type LucideIcon } from 'lucide-react';
import type { MaterialType } from '../../domain/types';
import { diffDays, formatShort, type IsoDate } from '../../lib/dates';
import { formatDays } from '../../lib/format';

export const MATERIAL_ICONS: Record<MaterialType, LucideIcon> = {
  book: BookOpen,
  course: GraduationCap,
  lecture: Presentation,
  article: FileText,
  video: Video,
  other: Shapes,
};

/** «сегодня», «завтра», «через 3 дня», «просрочено на 2 дня», «16 окт». */
export function formatDue(due: IsoDate, today: IsoDate): string {
  const diff = diffDays(today, due);
  if (diff < 0) return `просрочено на ${formatDays(-diff)}`;
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff <= 14) return `через ${formatDays(diff)}`;
  return formatShort(due);
}
