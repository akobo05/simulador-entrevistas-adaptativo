interface SparklineChartProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function SparklineChart({
  data,
  color = '#2563EB',
  width = 80,
  height = 32,
}: SparklineChartProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pad = 2; // padding interno para que el trazo no se corte
  const W = width - pad * 2;
  const H = height - pad * 2;

  /* Normaliza cada punto al espacio SVG */
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * W;
    const y = pad + H - ((v - min) / range) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const polyline = points.join(' ');

  /* Área de relleno: cierra el polígono por abajo */
  const firstX = pad;
  const lastX = pad + W;
  const bottom = pad + H;
  const areaPoints = `${firstX},${bottom} ${polyline} ${lastX},${bottom}`;

  const gradId = `spark-grad-${color.replace('#', '')}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Área de relleno */}
      <polygon points={areaPoints} fill={`url(#${gradId})`} />

      {/* Línea principal */}
      <polyline
        points={polyline}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Punto final destacado */}
      <circle
        cx={points.at(-1)!.split(',')[0]}
        cy={points.at(-1)!.split(',')[1]}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}
