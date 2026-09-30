import { Target } from 'lucide-react';
import type { Area } from '../domain/types';
import { AREA_ICON_COMPONENTS } from './areaIcons';

/** Иконка сферы в цветном квадрате. Без сферы — нейтральная мишень. */
export function AreaMark({ area, size = 'md' }: { area: Area | undefined; size?: 'sm' | 'md' }) {
  const Icon = area ? AREA_ICON_COMPONENTS[area.icon] : Target;
  const classes = ['area-mark'];
  if (size === 'sm') classes.push('area-mark--sm');
  if (area) classes.push(`tone-${area.color}`);
  return (
    <span className={classes.join(' ')} aria-hidden>
      <Icon size={size === 'sm' ? 15 : 20} strokeWidth={1.8} />
    </span>
  );
}
