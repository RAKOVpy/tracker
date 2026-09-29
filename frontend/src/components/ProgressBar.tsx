interface Props {
  /** 0..100 */
  percent: number;
  /** Где по плану должен быть прогресс сегодня, 0..100. */
  planPercent?: number;
  tone?: 'accent' | 'good' | 'bad';
}

export function ProgressBar({ percent, planPercent, tone = 'accent' }: Props) {
  const fillClass = tone === 'accent' ? 'progress__fill' : `progress__fill progress__fill--${tone}`;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
      <div className={fillClass} style={{ width: `${percent}%` }} />
      {planPercent !== undefined && planPercent > 0 && planPercent < 100 && (
        <div className="progress__plan" style={{ left: `${planPercent}%` }} title="Где нужно быть по плану" />
      )}
    </div>
  );
}
