import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "../icons";

type Props = {
  value: string; // ISO "yyyy-mm-dd"
  onChange: (iso: string) => void;
};

const WD = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MONTHS = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseISO = (iso: string): { y: number; m: number; d: number } | null => {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!p) return null;
  return { y: +p[1], m: +p[2] - 1, d: +p[3] };
};

// Po=0 … Ne=6
const mondayIndex = (jsDay: number) => (jsDay + 6) % 7;

const triggerLabel = (iso: string): { wd: string; rest: string } | null => {
  const p = parseISO(iso);
  if (!p) return null;
  const dt = new Date(p.y, p.m, p.d);
  const wd = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"][dt.getDay()];
  return { wd, rest: `${p.d}. ${p.m + 1}. ${p.y}` };
};

export function DateField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  // Month currently displayed in the popup
  const [view, setView] = useState(() => {
    const p = parseISO(value);
    const now = new Date();
    return { y: p ? p.y : now.getFullYear(), m: p ? p.m : now.getMonth() };
  });
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState(false); // popup opens upward when true

  // Re-sync the visible month whenever the popup opens (value may have changed)
  const toggle = () => {
    if (!open) {
      const p = parseISO(value);
      if (p) setView({ y: p.y, m: p.m });
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Decide whether to open above or below depending on available space
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setDrop(below < 360 && r.top > below);
  }, [open]);

  const sel = parseISO(value);
  const today = new Date();
  const todayKey = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  const firstDow = mondayIndex(new Date(view.y, view.m, 1).getDay());
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const step = (delta: number) => {
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  };

  const pick = (d: number) => {
    onChange(toISO(view.y, view.m, d));
    setOpen(false);
  };

  const goToday = () => {
    onChange(todayKey);
    setView({ y: today.getFullYear(), m: today.getMonth() });
    setOpen(false);
  };

  const lbl = triggerLabel(value);

  return (
    <div className="od-datefield" ref={wrapRef}>
      <button
        type="button"
        className={`od-date-trigger${open ? " is-open" : ""}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {lbl ? (
          <span className="od-date-txt">
            <span className="od-date-wd">{lbl.wd}</span>
            {lbl.rest}
          </span>
        ) : (
          <span className="od-date-txt od-date-placeholder">Vyber datum</span>
        )}
        <CalendarDays size={17} className="od-date-ico" />
      </button>

      {open && (
        <div
          className={`od-cal${drop ? " od-cal-up" : ""}`}
          role="dialog"
          aria-label="Výběr data"
        >
          <div className="od-cal-head">
            <button
              type="button"
              className="od-cal-nav"
              onClick={() => step(-1)}
              aria-label="Předchozí měsíc"
            >
              <ChevronLeft size={17} />
            </button>
            <span className="od-cal-title">
              {MONTHS[view.m]} <span className="od-cal-year">{view.y}</span>
            </span>
            <button
              type="button"
              className="od-cal-nav"
              onClick={() => step(1)}
              aria-label="Další měsíc"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="od-cal-wd">
            {WD.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="od-cal-grid">
            {cells.map((d, i) => {
              if (d === null) return <span key={i} className="od-cal-empty" />;
              const key = toISO(view.y, view.m, d);
              const isSel =
                !!sel && sel.y === view.y && sel.m === view.m && sel.d === d;
              const isToday = key === todayKey;
              return (
                <button
                  type="button"
                  key={i}
                  className={`od-cal-day${isSel ? " is-sel" : ""}${
                    isToday ? " is-today" : ""
                  }`}
                  onClick={() => pick(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="od-cal-foot">
            <button type="button" className="od-cal-today" onClick={goToday}>
              Dnes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}