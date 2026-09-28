import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Entry } from "../types";
import { MONTHS_SHORT } from "../constants";
import { isoOf, plural, todayISO, weekdayLabel } from "../utils/format";

type Props = {
  year: number;
  // Zásahy (Souhrn), nebo hotové počty po dnech (např. nehody v Historii).
  entries?: Entry[];
  counts?: Map<string, number>;
  // Popisek počtu v tooltipu a patička.
  unitLabel?: string;
  footText?: string;
  // Doplňující řádek tooltipu (např. název svátku).
  dayNote?: (iso: string) => string | null;
};

type Cell = { iso: string; count: number; level: number; inYear: boolean };

const WEEKDAY_LABELS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

// Počet zásahů → úroveň 0–4 (0 = žádný). Stupnice je dynamická: nejsvětlejší
// úroveň (4) patří VÝHRADNĚ dnům s nejvyšším denním počtem v roce. Ostatní dny
// se rozloží do úrovní 1–3 podle poměru k maximu. Když maximum vzroste (nový
// rekordní den), dosavadní „špičkové" dny barvu automaticky sníží.
const levelOf = (count: number, max: number): number =>
  count <= 0 ? 0 : count >= max ? 4 : Math.max(1, Math.min(3, Math.ceil((count / max) * 3)));

// Monday-based index (Po = 0 … Ne = 6).
const mondayIdx = (d: Date): number => (d.getDay() + 6) % 7;

export function ActivityHeatmap({ entries, counts, year, unitLabel = "Zásahy", footText, dayNote }: Props) {
  const today = todayISO();

  const { weeks, monthLabels, total, activeDays } = useMemo(() => {
    // Počet zásahů na kalendářní den (skutečné datum, ne výplatní období).
    const byDate = new Map<string, number>();
    let total = 0;
    if (counts) {
      for (const [iso, n] of counts) {
        if (parseInt(iso.slice(0, 4), 10) !== year || n <= 0) continue;
        byDate.set(iso, n);
        total += n;
      }
    } else {
      for (const e of entries ?? []) {
        if (parseInt(e.date.slice(0, 4), 10) !== year) continue;
        byDate.set(e.date, (byDate.get(e.date) ?? 0) + 1);
        total += 1;
      }
    }
    let maxCount = 0;
    for (const v of byDate.values()) if (v > maxCount) maxCount = v;

    // Mřížka: od pondělí týdne s 1. lednem až do neděle týdne s 31. prosincem.
    const yearStart = new Date(year, 0, 1);
    const gridStart = new Date(year, 0, 1 - mondayIdx(yearStart));
    const yearEnd = new Date(year, 11, 31);
    const gridEnd = new Date(year, 11, 31 + (6 - mondayIdx(yearEnd)));

    const weeks: Cell[][] = [];
    const monthLabels: { col: number; label: string }[] = [];
    let prevMonth = -1;
    const cur = new Date(gridStart);
    while (cur <= gridEnd) {
      const week: Cell[] = [];
      let weekMonth = -1;
      for (let r = 0; r < 7; r++) {
        const inYear = cur.getFullYear() === year;
        const iso = isoOf(cur);
        const count = inYear ? byDate.get(iso) ?? 0 : 0;
        week.push({ iso, count, level: levelOf(count, maxCount), inYear });
        if (inYear && weekMonth === -1) weekMonth = cur.getMonth();
        cur.setDate(cur.getDate() + 1);
      }
      if (weekMonth !== -1 && weekMonth !== prevMonth) {
        monthLabels.push({ col: weeks.length, label: MONTHS_SHORT[weekMonth] });
        prevMonth = weekMonth;
      }
      weeks.push(week);
    }

    return { weeks, monthLabels, total, activeDays: byDate.size };
  }, [entries, counts, year]);

  const monthByCol = new Map(monthLabels.map((m) => [m.col, m.label]));

  // Velikost buňky se dopočítá z šířky panelu, aby se mřížka roztáhla na celou
  // šířku. Na úzkém displeji spadne na minimum a obsah se scrolluje.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(14);
  const [hover, setHover] = useState<{ x: number; y: number; iso: string; count: number } | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || weeks.length === 0) return;
    const GAP = 3, GUT = 30, MIN = 9, MAX = 30;
    const update = () => {
      const w = el.clientWidth || 0;
      const avail = w - GUT - GAP - (weeks.length - 1) * GAP;
      setCell(Math.max(MIN, Math.min(MAX, Math.floor(avail / weeks.length))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [weeks.length]);

  const fullDate = (iso: string): string => {
    const [y, m, d] = iso.split("-");
    return `${+d}. ${+m}. ${y}`;
  };
  const weekdayCap = (iso: string): string => {
    const w = weekdayLabel(iso);
    return w.charAt(0).toUpperCase() + w.slice(1);
  };

  return (
    <div className="ah" ref={wrapRef} style={{ "--ah-cell": cell + "px" } as CSSProperties}>
      <div className="ah-scroll">
        <div className="ah-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--ah-cell))` }}>
          {weeks.map((_, c) => (
            <span key={c} className="ah-month">{monthByCol.get(c) ?? ""}</span>
          ))}
        </div>
        <div className="ah-body">
          <div className="ah-days">
            {WEEKDAY_LABELS.map((d, i) => (
              <span key={i} className="ah-day">{d}</span>
            ))}
          </div>
          <div className="ah-grid" onMouseLeave={() => setHover(null)}>
            {weeks.map((week, c) => (
              <div key={c} className="ah-col">
                {week.map((dc) =>
                  dc.inYear ? (
                    <div
                      key={dc.iso}
                      className={"ah-cell ah-l" + dc.level + (dc.iso === today ? " is-today" : "")}
                      onMouseEnter={(e) => {
                        const wrap = wrapRef.current;
                        if (!wrap) return;
                        const wr = wrap.getBoundingClientRect();
                        const r = e.currentTarget.getBoundingClientRect();
                        const HALF = 104;
                        const x = Math.min(Math.max(r.left - wr.left + r.width / 2, HALF), wr.width - HALF);
                        setHover({ x, y: r.top - wr.top, iso: dc.iso, count: dc.count });
                      }}
                    />
                  ) : (
                    <div key={dc.iso} className="ah-cell ah-empty" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover && (
        <div className="ah-tip" style={{ left: hover.x, top: hover.y }}>
          <div className="od-charttip">
            <div className="od-tip-h">{weekdayCap(hover.iso)} · {fullDate(hover.iso)}</div>
            <div className="od-tip-r">
              <span className="d n" /> {unitLabel} <b>{hover.count}</b>
            </div>
            {dayNote?.(hover.iso) && <div className="od-tip-r">{dayNote(hover.iso)}</div>}
          </div>
        </div>
      )}
      <div className="ah-foot">
        <span className="ah-foot-info">
          {footText ?? <>{activeDays} {plural(activeDays, "den", "dny", "dní")} se zásahy · {total} celkem</>}
        </span>
      </div>
    </div>
  );
}
