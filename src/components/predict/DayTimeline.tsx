import { useEffect, useMemo, useState } from "react";
import type { ModelParams } from "../../predict/types";
import { evaluate, probAtLeastOne } from "../../predict/model";
import { hourRange } from "../../predict/labels";
import { heatColor, pct } from "./heat";

type Props = {
  params: ModelParams;
  d: number;
  h: number;
  onHour: (h: number) => void;
};

const STEP_MS = 750;
const TICKS = [0, 6, 12, 18];

// Časová osa dne pod mapou: sloupec = nejlepší šance v hodině (klepnutím se
// hodina vybere), ▶ „přehraje" den a mapa se po hodinách přebarvuje.
export function DayTimeline({ params, d, h, onHour }: Props) {
  const [playing, setPlaying] = useState(false);
  const probs = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hh) => {
        const ev = evaluate(params, d, hh);
        return ev.best === -1 ? 0 : probAtLeastOne(ev.scores[ev.best]);
      }),
    [params, d],
  );
  const max = Math.max(...probs, 1e-9);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => onHour((h + 1) % 24), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, h, onHour]);

  return (
    <div className="pr-tl">
      <button
        className={"pr-tl-play" + (playing ? " is-playing" : "")}
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Zastavit přehrávání dne" : "Přehrát den po hodinách"}
        title={playing ? "Zastavit" : "Přehrát den"}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
        )}
      </button>
      <div className="pr-tl-main">
        <div className="pr-tl-bars" role="group" aria-label="Hodiny dne">
          {probs.map((p, hh) => (
            <button
              key={hh}
              className={"pr-tl-bar" + (hh === h ? " is-sel" : "")}
              onClick={() => {
                setPlaying(false);
                onHour(hh);
              }}
              aria-label={`${hourRange(hh)}: šance ${pct(p)}`}
              aria-pressed={hh === h}
              title={`${hourRange(hh)} · ${pct(p)}`}
            >
              <span style={{ height: `${Math.max(8, (p / max) * 100)}%`, background: heatColor(p / max) }} />
            </button>
          ))}
        </div>
        <div className="pr-tl-ticks" aria-hidden="true">
          {Array.from({ length: 24 }, (_, hh) => (
            <span key={hh} className="mono">{TICKS.includes(hh) ? hh : ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
