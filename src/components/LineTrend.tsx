import { useEffect, useRef, useState } from "react";
import type { TrendPoint } from "../types";
import { czk, kfmt } from "../utils/format";
import { niceCeil } from "../utils/stats";

type Props = { points: TrendPoint[] };

export function LineTrend({ points }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setW(el.clientWidth || 700);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = w < 560 ? 230 : 300;
  const padL = 46, padR = 14, padT = 12, padB = 28;
  const plotW = Math.max(10, w - padL - padR);
  const plotH = H - padT - padB;
  const n = points.length;
  // Hodnoty obou čar (obrat i zisk) jen z dní/měsíců se záznamy.
  const vals = points.filter((p) => p.count).flatMap((p) => [p.total, p.profit]);
  const dataMax = vals.length ? Math.max(...vals) : 0;
  const dataMin = vals.length ? Math.min(...vals) : 0;
  const range = dataMax - dataMin;
  // Osu Y "nakloníme" k rozsahu dat (nezačínáme nutně na nule), aby byly
  // rozdíly mezi body výrazně víc vidět. Dole i nahoře necháme 12% rezervu.
  let domainMin: number, domainMax: number;
  if (range > 0) {
    const pad = range * 0.05;
    domainMin = Math.max(0, dataMin - pad);
    domainMax = dataMax + pad;
  } else {
    domainMin = 0;
    domainMax = niceCeil(dataMax) || 1;
  }
  const span = domainMax - domainMin || 1;
  const X = (i: number) => padL + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
  const Y = (v: number) => padT + plotH * (1 - (v - domainMin) / span);

  const baseY = padT + plotH;

  // Spojité úseky (běhy po sobě jdoucích bodů se záznamy); mezery přeruší čáru.
  const segments: number[][] = [];
  points.forEach((p, i) => {
    if (!p.count) return;
    const last = segments[segments.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else segments.push([i]);
  });

  // Catmull-Rom → Bézier: plynulá křivka místo lomené čáry.
  const smooth = (pts: { x: number; y: number }[]): string => {
    const f = (v: number) => v.toFixed(1);
    if (!pts.length) return "";
    if (pts.length === 1) return `M${f(pts[0].x)},${f(pts[0].y)}`;
    let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
    const t = 0.16;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) * t;
      const c1y = p1.y + (p2.y - p0.y) * t;
      const c2x = p2.x - (p3.x - p1.x) * t;
      const c2y = p2.y - (p3.y - p1.y) * t;
      d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
    }
    return d;
  };

  const segPts = (seg: number[], sel: (p: TrendPoint) => number) =>
    seg.map((i) => ({ x: X(i), y: Y(sel(points[i])) }));
  const lineFor = (sel: (p: TrendPoint) => number) =>
    segments.map((seg) => smooth(segPts(seg, sel))).join(" ");
  const areaFor = (sel: (p: TrendPoint) => number) =>
    segments
      .map((seg) => {
        const pts = segPts(seg, sel);
        if (!pts.length) return "";
        return `${smooth(pts)} L${pts[pts.length - 1].x.toFixed(1)},${baseY.toFixed(1)} L${pts[0].x.toFixed(1)},${baseY.toFixed(1)} Z`;
      })
      .join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const hv = hover != null ? points[hover] : null;
  const tipHalf = w < 480 ? 80 : 92;
  const tipX = hover != null ? Math.min(Math.max(X(hover), tipHalf + 6), w - tipHalf - 6) : 0;
  const tipY = hv && hv.count ? Math.max(28, Math.min(Y(hv.total), Y(hv.profit))) : 0;

  // Počet popisků odvozený jen od dostupné šířky (na mobilu míň, ať se
  // nepřekrývají). Kotvíme od konce, aby poslední datum bylo vždy vidět
  // a rozestupy byly rovnoměrné.
  const labelSlots = Math.max(2, Math.floor(plotW / (w < 480 ? 52 : 58)));
  const labelStride = Math.max(1, Math.ceil(n / labelSlots));

  return (
    <div className="od-linewrap" ref={wrapRef}>
      <svg
        className="od-lt-svg"
        width={w}
        height={H}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="lt-fill-o" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4711e" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#f4711e" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lt-fill-n" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5ed18a" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#5ed18a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lt-line-o" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f4711e" />
            <stop offset="100%" stopColor="#ffae73" />
          </linearGradient>
          <linearGradient id="lt-line-n" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5ed18a" />
            <stop offset="100%" stopColor="#9be9bb" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => {
          const y = padT + plotH * (1 - t);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#2c2823" strokeDasharray="3 3" />
              <text className="od-lt-axis" x={padL - 8} y={y + 3} textAnchor="end">
                {kfmt(domainMin + span * t)}
              </text>
            </g>
          );
        })}
        {points.map((p, i) =>
          (n - 1 - i) % labelStride === 0 ? (
            <text
              key={i}
              className="od-lt-axis"
              x={X(i)}
              y={H - 8}
              textAnchor="middle"
              fill={p.isCurrent ? "#f4711e" : "#5d564c"}
            >
              {p.label}
            </text>
          ) : null,
        )}

        {hover != null && (
          <line
            x1={X(hover)}
            y1={padT}
            x2={X(hover)}
            y2={padT + plotH}
            stroke="#3a352e"
            strokeDasharray="3 3"
          />
        )}

        <path d={areaFor((p) => p.total)} fill="url(#lt-fill-o)" stroke="none" />
        <path d={areaFor((p) => p.profit)} fill="url(#lt-fill-n)" stroke="none" />

        <path
          d={lineFor((p) => p.total)}
          fill="none"
          stroke="url(#lt-line-o)"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 2px 7px rgba(244, 113, 30, .45))" }}
        />
        <path
          d={lineFor((p) => p.profit)}
          fill="none"
          stroke="url(#lt-line-n)"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 2px 7px rgba(94, 209, 138, .4))" }}
        />

        {points.map((p, i) =>
          p.count && p.isCurrent ? (
            <circle key={"now" + i} cx={X(i)} cy={Y(p.total)} r={4} fill="none" stroke="#f4711e" strokeWidth="1.6">
              <animate attributeName="r" values="4;14" dur="1.9s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.65;0" dur="1.9s" repeatCount="indefinite" />
            </circle>
          ) : null,
        )}

        {points.map((p, i) =>
          p.count ? (
            <g key={"p" + i}>
              <circle cx={X(i)} cy={Y(p.total)} r={hover === i ? 5.5 : 3.5} fill="#141210" stroke="#f4711e" strokeWidth="2" />
              <circle cx={X(i)} cy={Y(p.profit)} r={hover === i ? 5.5 : 3.5} fill="#141210" stroke="#5ed18a" strokeWidth="2" />
            </g>
          ) : null,
        )}


        {points.map((_, i) => {
          const left = i === 0 ? 0 : (X(i - 1) + X(i)) / 2;
          const right = i === n - 1 ? w : (X(i) + X(i + 1)) / 2;
          return (
            <rect
              key={"h" + i}
              x={left}
              y={0}
              width={right - left}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
      </svg>

      {hv && hv.count > 0 && hover != null && (
        <div className="od-lt-tip" style={{ left: tipX + "px", top: tipY + "px" }}>
          <div className="od-charttip">
            <div className="od-tip-h">{hv.fullLabel}</div>
            <div className="od-tip-r">
              <span className="d o" /> Obrat <b>{czk(hv.total)}</b>
            </div>
            <div className="od-tip-r">
              <span className="d n" /> Zisk <b>{czk(hv.profit)}</b>
            </div>
            <div className="od-tip-r">
              <span className="d g" /> Zásahy <b>{hv.count}</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
