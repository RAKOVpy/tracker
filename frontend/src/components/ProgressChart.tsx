import type { GoalStats } from '../domain/progress';
import type { Goal } from '../domain/types';
import { addDays, diffDays, formatShort, type IsoDate } from '../lib/dates';
import { formatNumber } from '../lib/format';
import { formatAmount } from './pace';

interface Props {
  goal: Goal;
  stats: GoalStats;
  today: IsoDate;
}

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 44 };

/** Накопленный прогресс по дням против линейного плана. */
export function ProgressChart({ goal, stats, today }: Props) {
  const { targetValue: target, startDate } = goal;
  const todayIndex = diffDays(startDate, today); // 0 — день старта
  const days = Math.max(stats.totalDays, todayIndex + 1);

  // Точка i — накопленный итог на конец (i - 1)-го дня; точка 0 — всё, что внесено до старта.
  let cumulative = 0;
  for (const [date, value] of stats.dailyTotals) {
    if (date < startDate) cumulative += value;
  }
  const actual: { i: number; value: number }[] = [{ i: 0, value: cumulative }];
  const lastIndex = Math.min(todayIndex, days - 1);
  for (let d = 0; d <= lastIndex; d++) {
    cumulative += stats.dailyTotals.get(addDays(startDate, d)) ?? 0;
    actual.push({ i: d + 1, value: cumulative });
  }

  const yMax = Math.max(target, cumulative) * 1.05 || 1;
  const x = (i: number) => PAD.left + (i / days) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);

  const actualPath = actual.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${actualPath} L${x(actual[actual.length - 1].i).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = actual[actual.length - 1];
  const hasActual = todayIndex >= 0;
  const yTicks = [0, target / 2, target];

  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График прогресса: факт и план">
        {yTicks.map((tick) => (
          <g key={tick}>
            <line className="chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="chart__axis-label" x={PAD.left - 8} y={y(tick) + 4} textAnchor="end">
              {formatNumber(Math.round(tick))}
            </text>
          </g>
        ))}

        <text className="chart__axis-label" x={x(0)} y={H - 6} textAnchor="start">
          {formatShort(startDate)}
        </text>
        <text className="chart__axis-label" x={x(stats.totalDays)} y={H - 6} textAnchor="end">
          {formatShort(goal.deadline)}
        </text>

        <line className="chart__plan" x1={x(0)} y1={y(0)} x2={x(stats.totalDays)} y2={y(target)} />

        {hasActual && (
          <>
            <line className="chart__today" x1={x(last.i)} x2={x(last.i)} y1={PAD.top} y2={H - PAD.bottom} />
            <path className="chart__area" d={areaPath} />
            <path className="chart__actual" d={actualPath} />
            <circle className="chart__dot" cx={x(last.i)} cy={y(last.value)} r={5} />
          </>
        )}
      </svg>
      <figcaption className="legend">
        <span>
          <span className="legend__swatch" />
          Факт
        </span>
        <span>
          <span className="legend__swatch legend__swatch--plan" />
          План
        </span>
        {hasActual && todayIndex < stats.totalDays && (
          <span>
            По плану к концу дня: {formatAmount(stats.expectedByToday, goal.unit)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
