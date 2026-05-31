"use client";
/**
 * ConvergenceChart — Grafik konvergensi GA (pure SVG)
 */

interface Props { data: number[]; }

export default function ConvergenceChart({ data }: Props) {
  if (!data || data.length < 2) return null;

  const finite = data.filter(v => v < 1e15);
  if (finite.length < 2) return null;

  const W = 310, H = 100, PAD = { top: 8, right: 8, bottom: 22, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const minY = Math.min(...finite);
  const maxY = Math.max(...finite);
  const rangeY = maxY - minY || 1;

  const xScale = (i: number) => PAD.left + (i / (data.length - 1)) * plotW;
  const yScale = (v: number) => {
    const clamped = Math.min(v, maxY);
    return PAD.top + plotH - ((clamped - minY) / rangeY) * plotH;
  };

  const pts = data.map((v, i) => `${xScale(i)},${yScale(v)}`).join(" ");
  const ticks = [minY, minY + rangeY / 2, maxY];

  function fmt(v: number) {
    if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v/1e3).toFixed(0)}K`;
    return v.toFixed(0);
  }

  const lastPt = { x: xScale(data.length - 1), y: yScale(data[data.length - 1]) };

  return (
    <div className="chart-wrap">
      <div className="chart-title">
        <span className="chart-dot" />
        {data.length} Generasi
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.12"/>
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0"/>
          </linearGradient>
          <clipPath id="cgClip">
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH}/>
          </clipPath>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={yScale(t)} x2={PAD.left + plotW} y2={yScale(t)}
              stroke="#d5d0c8" strokeWidth="1" strokeDasharray="3 3"/>
            <text x={PAD.left - 4} y={yScale(t) + 3}
              textAnchor="end" fontSize="8" fill="#9e9b93">{fmt(t)}</text>
          </g>
        ))}

        {[0, Math.floor(data.length/2), data.length - 1].map((idx) => (
          <text key={idx} x={xScale(idx)} y={H - PAD.bottom + 12}
            textAnchor="middle" fontSize="8" fill="#9e9b93">{idx + 1}</text>
        ))}

        <polygon clipPath="url(#cgClip)"
          points={`${PAD.left},${PAD.top + plotH} ${pts} ${PAD.left + plotW},${PAD.top + plotH}`}
          fill="url(#cgFill)"/>

        <polyline clipPath="url(#cgClip)" points={pts}
          fill="none" stroke="#2563eb" strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round"/>

        <circle cx={lastPt.x} cy={lastPt.y} r="3" fill="#0891b2" stroke="white" strokeWidth="1.5"/>

        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH}
          stroke="#d5d0c8" strokeWidth="1"/>
        <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
          stroke="#d5d0c8" strokeWidth="1"/>
      </svg>
    </div>
  );
}
