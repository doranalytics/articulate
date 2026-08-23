"use client";

// The scorecard: a square whose four corners are the four axes. Each score
// travels from the center diagonally toward its corner — a full square means
// a complete speaker; a short leg names the weakness at a glance.

import { useEffect, useRef, useState } from "react";
import type { Axis } from "@/lib/challenges";
import { AXIS_LABEL } from "@/lib/challenges";

const CORNERS: { axis: Axis; dx: number; dy: number; anchor: "start" | "end"; label: [number, number] }[] = [
  { axis: "conciseness", dx: -1, dy: -1, anchor: "start", label: [16, 24] },
  { axis: "vocabulary", dx: 1, dy: -1, anchor: "end", label: [184, 24] },
  { axis: "articulation", dx: 1, dy: 1, anchor: "end", label: [184, 186] },
  { axis: "filler", dx: -1, dy: 1, anchor: "start", label: [16, 186] },
];

export function RadarChart({ scores, animate = true, size = 280 }: {
  scores: Record<Axis, number | null>;
  animate?: boolean;
  size?: number;
}) {
  const [t, setT] = useState(animate ? 0 : 1);
  const raf = useRef(0);

  useEffect(() => {
    if (!animate) return;
    const start = performance.now();
    const dur = 1100;
    const step = (now: number) => {
      const raw = Math.min(1, (now - start) / dur);
      // springy ease-out — the "splash"
      const eased = 1 - Math.pow(1 - raw, 3);
      setT(eased);
      if (raw < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [animate, scores]);

  const C = 100; // center of a 200x200 viewbox
  const R = 62; // max half-diagonal reach
  const pts = CORNERS.map(({ axis, dx, dy }) => {
    const v = ((scores[axis] ?? 0) / 100) * R * t;
    return [C + dx * v, C + dy * v] as const;
  });
  const poly = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const grid = [0.33, 0.66, 1];

  return (
    <svg viewBox="0 0 200 210" width={size} height={size * 1.05} role="img" aria-label="Score chart">
      {/* frame + grid squares (rotated 45° track of the diagonals) */}
      {grid.map((g) => (
        <polygon
          key={g}
          points={CORNERS.map(({ dx, dy }) => `${C + dx * R * g},${C + dy * R * g}`).join(" ")}
          fill="none"
          stroke="var(--line)"
          strokeWidth={g === 1 ? 1.4 : 0.8}
        />
      ))}
      <line x1={C - R} y1={C - R} x2={C + R} y2={C + R} stroke="var(--line)" strokeWidth="0.6" />
      <line x1={C - R} y1={C + R} x2={C + R} y2={C - R} stroke="var(--line)" strokeWidth="0.6" />

      <polygon points={poly} fill="rgba(29, 92, 61, 0.18)" stroke="var(--green-bright)" strokeWidth="2" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.2" fill="var(--green)" stroke="var(--gold)" strokeWidth="1" />
      ))}

      {CORNERS.map(({ axis, anchor, label }) => {
        const v = scores[axis];
        return (
          <g key={axis}>
            <text x={label[0]} y={label[1]} textAnchor={anchor} fontSize="8.5" fill="var(--sub)" style={{ fontFamily: "var(--font-geist)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {AXIS_LABEL[axis]}
            </text>
            <text x={label[0]} y={label[1] + 12} textAnchor={anchor} fontSize="12" fontWeight={600} fill="var(--ink)" style={{ fontFamily: "var(--font-geist-mono)", opacity: t }}>
              {v === null ? "—" : Math.round(v * t)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
