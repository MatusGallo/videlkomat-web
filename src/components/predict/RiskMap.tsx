import { useMemo, useRef, useState } from "react";
import type { ModelParams } from "../../predict/types";
import { topWindows, weekGrid } from "../../predict/model";
import { DAY_LONG, DAY_SHORT, hourRange } from "../../predict/labels";
import { dateLabel, todayISO } from "../../utils/format";
import { AlertTriangle, ChevronRight } from "../../icons";
import { heatColor, heatGradient, pct } from "./heat";
import { dayKind, isoLocal } from "../../predict/calendar";

type Props = {
  params: ModelParams;
  // Data nejbližších 7 dnů podle dne v týdnu (Po = 0) – svátky v tomto týdnu.
  dates: Date[];
  // Aktuální den a hodina (zvýrazněná buňka).
  nowD: number;
  nowH: number;
  // Klepnutí na buňku / okno → otevřít obrazovku Teď s tímto časem.
  onPick: (d: number, h: number) => void;
};

const HOUR_TICKS = [0, 6, 12, 18];

export function RiskMap({ params, dates, nowD, nowH, onPick }: Props) {
  const grid = useMemo(() => weekGrid(params), [params]);
  const top = useMemo(() => topWindows(grid, 5), [grid]);
  const { min, max } = useMemo(() => {
    const all = grid.flat().map((c) => c.prob);
    return { min: Math.min(...all), max: Math.max(...all) };
  }, [grid]);
  const norm = (p: number) => (max > min ? (p - min) / (max - min) : 0);

  const today = todayISO();
  const alerts = params.alerts.filter((a) => a.until >= today);
  const zoneName = (id: string) => params.zones.find((z) => z.id === id)?.name ?? id;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; d: number; h: number } | null>(null);
  const hovered = hover ? grid[hover.d][hover.h] : null;
  const dayOf = (d: number) => ({ date: dateLabel(isoLocal(dates[d])), holiday: dayKind(dates[d]).name });

  return (
    <>
      {alerts.map((a) => (
        <div className="pr-alert" key={a.zoneId + a.until}>
          <AlertTriangle size={18} />
          <div>
            <b>{a.label}</b>
            <span>
              {zoneName(a.zoneId)} · do {dateLabel(a.until)} {a.until.slice(0, 4)} · vyšší poptávka je v modelu započtená
            </span>
          </div>
        </div>
      ))}

      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Nejlepší dosažitelná šance v nejbližších 7 dnech</div>
          <div className="pr-legend">
            <span className="mono">{pct(min)}</span>
            <span className="pr-legend-bar" style={{ background: heatGradient() }} />
            <span className="mono">{pct(max)}</span>
          </div>
        </div>

        <div className="pr-heat" ref={wrapRef} onMouseLeave={() => setHover(null)}>
          <div className="pr-heat-row pr-heat-hours" aria-hidden="true">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="pr-heat-tick mono">{HOUR_TICKS.includes(h) ? h : ""}</span>
            ))}
          </div>
          {grid.map((row, d) => (
            <div className="pr-heat-row" key={d}>
              <span className={"pr-heat-day" + (dayOf(d).holiday ? " is-hol" : "")} title={dayOf(d).holiday ?? undefined}>
                {DAY_SHORT[d]}
              </span>
              {row.map((c) => (
                <button
                  key={c.h}
                  className={"pr-heat-cell" + (c.d === nowD && c.h === nowH ? " is-now" : "")}
                  style={{ background: heatColor(norm(c.prob)) }}
                  aria-label={`${DAY_LONG[c.d]} ${dayOf(c.d).date} ${hourRange(c.h)}: ${pct(c.prob)}`}
                  onClick={() => onPick(c.d, c.h)}
                  onMouseEnter={(e) => {
                    const wrap = wrapRef.current;
                    if (!wrap) return;
                    const wr = wrap.getBoundingClientRect();
                    const r = e.currentTarget.getBoundingClientRect();
                    const HALF = 110;
                    const x = Math.min(Math.max(r.left - wr.left + r.width / 2, HALF), wr.width - HALF);
                    setHover({ x, y: r.top - wr.top, d: c.d, h: c.h });
                  }}
                />
              ))}
            </div>
          ))}
          {hover && hovered && (
            <div className="ah-tip" style={{ left: hover.x, top: hover.y }}>
              <div className="od-charttip">
                <div className="od-tip-h">
                  {DAY_LONG[hovered.d]} {dayOf(hovered.d).date} · {hourRange(hovered.h)}
                </div>
                {dayOf(hovered.d).holiday && <div className="od-tip-r">{dayOf(hovered.d).holiday}</div>}
                <div className="od-tip-r">
                  <span className="d o" /> Šance <b>{pct(hovered.prob)}</b>
                </div>
                <div className="od-tip-r">
                  Stanoviště <b>{params.stands[hovered.best]?.name ?? "–"}</b>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="pr-note">Klepnutím na hodinu otevřete doporučení pro tento čas.</div>
      </section>

      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Top 5 oken v nejbližších 7 dnech</div>
        </div>
        <ol className="pr-top">
          {top.map((c, i) => (
            <li key={`${c.d}-${c.h}`}>
              <button onClick={() => onPick(c.d, c.h)}>
                <span className="pr-top-n mono">{i + 1}</span>
                <span className="pr-top-main">
                  <span className="pr-top-when">{DAY_LONG[c.d]} {dayOf(c.d).date} {hourRange(c.h)}</span>
                  <span className="pr-top-where">{params.stands[c.best]?.name ?? "–"}</span>
                </span>
                <span className="pr-top-val mono">{pct(c.prob)}</span>
                <ChevronRight size={17} className="od-menu-chev" />
              </button>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
