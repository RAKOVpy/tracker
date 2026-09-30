import {
  BookOpen,
  Briefcase,
  Code,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  House,
  Languages,
  Music,
  Plane,
  Star,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AreaIcon as AreaIconName } from '../domain/types';

export const AREA_ICON_COMPONENTS: Record<AreaIconName, LucideIcon> = {
  book: BookOpen,
  languages: Languages,
  dumbbell: Dumbbell,
  study: GraduationCap,
  work: Briefcase,
  health: HeartPulse,
  code: Code,
  music: Music,
  money: Wallet,
  home: House,
  travel: Plane,
  star: Star,
};

export const AREA_ICON_LABELS: Record<AreaIconName, string> = {
  book: 'Книга',
  languages: 'Языки',
  dumbbell: 'Спорт',
  study: 'Учёба',
  work: 'Работа',
  health: 'Здоровье',
  code: 'Код',
  music: 'Музыка',
  money: 'Деньги',
  home: 'Дом',
  travel: 'Путешествия',
  star: 'Звезда',
};
