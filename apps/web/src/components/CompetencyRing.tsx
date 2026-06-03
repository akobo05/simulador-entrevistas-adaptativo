interface Props {
  label: string;
  score: number | null;
}

// Anillo de progreso con conic-gradient. La condicion de "sin datos" es
// score === null (NUNCA !score): un score 0 es valido y distinto de sin datos.
export function CompetencyRing({ label, score }: Props) {
  const hasData = score !== null;
  const pct = hasData ? Math.max(0, Math.min(100, score)) : 0;
  const ringStyle = {
    background: `conic-gradient(var(--ring-color, #ff6b35) ${pct * 3.6}deg, var(--ring-track, #2a2a35) 0deg)`,
  };
  return (
    <div className="competency-ring">
      <div
        className="ring-circle"
        style={ringStyle}
        role="img"
        aria-label={hasData ? `${label}: ${score} de 100` : `${label}: sin datos`}
      >
        <div className="ring-inner">
          {hasData ? <span>{score}</span> : <span className="ring-nodata">sin datos</span>}
        </div>
      </div>
      <span className="ring-label">{label}</span>
    </div>
  );
}
