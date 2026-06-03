import './ProgressRing.css';

export interface ProgressRingProps {
  value: number; // 0-100
  size?: number; // px, default 80
  color?: string; // default --accent
  label?: string | undefined; // texto extra debajo del %
}

export function ProgressRing({
  value,
  size = 80,
  color = 'var(--accent)',
  label,
}: ProgressRingProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  const strokeWidth = size * 0.1; // 10 % del tamano
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clampedValue / 100);

  const cx = size / 2;
  const cy = size / 2;

  const fontSize = size * 0.22;
  const labelFontSize = size * 0.14;

  return (
    <span
      className="progress-ring"
      role="img"
      aria-label={label ? `${label}: ${clampedValue}%` : `${clampedValue}%`}
      data-testid="progress-ring"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Track */}
        <circle
          className="progress-ring__track"
          cx={cx}
          cy={cy}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          stroke="#E2E8F0"
        />

        {/* Indicador */}
        <circle
          className="progress-ring__indicator"
          cx={cx}
          cy={cy}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          /* rotate -90 para que arranque desde las 12 */
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />

        {/* Porcentaje central */}
        <text
          className="progress-ring__value"
          x={cx}
          y={label ? cy - labelFontSize * 0.6 : cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fill="var(--text)"
          fontFamily="var(--font-display)"
          fontWeight="700"
        >
          {clampedValue}%
        </text>

        {/* Label opcional */}
        {label && (
          <text
            className="progress-ring__label"
            x={cx}
            y={cy + fontSize * 0.6}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={labelFontSize}
            fill="var(--text-muted)"
            fontFamily="var(--font-body)"
          >
            {label}
          </text>
        )}
      </svg>
    </span>
  );
}
