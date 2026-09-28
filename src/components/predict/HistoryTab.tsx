import { useMemo, useState } from "react";
import type { JobLog, ModelParams } from "../../predict/types";
import { dayKind, isoLocal } from "../../predict/calendar";
import { DAY_LONG, DAY_SHORT } from "../../predict/labels";
import { MONTHS } from "../../constants";
import { dateLabel, num1, plural } from "../../utils/format";
import { ChevronLeft, ChevronRight, Clock } from "../../icons";
import { ActivityHeatmap } from "../ActivityHeatmap";
import { heatColor, pct } from "./heat";
import { PragueMap, type MapDot, type MapStand, type MapZone } from "./PragueMap";
import raw from "../../predict/history.json";

// Historie nehod Policie ČR (import-cdv.ts --bundle): počty po dnech v celé
// Praze a jednotlivé nehody na síti. Ukazuje, co se dělo v minulých letech
// kolem vybraného data, kalendář, svátky / sezónu a vlastní výjezdy.

type History = {
  source: string;
  from: string;
  daily: number[];
  zones: string[];
  // [den od from, hodina (−1 = neznámá), index úseku, lat×1e4 − 500000, lng×1e4 − 140000]
  events: number[][];
};
const H = raw as History;

type Props = { params: ModelParams; jobs: JobLog[] };

// Okno kolem vybraného data pro mapu (± dní).
const WINDOW = 3;
const DOT = "#e8a24a";
const NO_STANDS: MapStand[] = [];
const WON = "#5ed18a";
const LOST = "#e8624a";

const [Y0, M0, D0] = H.from.split("-").map(Number);
const dayAt = (i: number) => new Date(Y0, M0 - 1, D0 + i);
const indexOf = (d: Date) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(Y0, M0 - 1, D0).getTime()) / 864e5);
const signed = (f: number) => `${f >= 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)} %`;
const zoneNameOf = (byId: Map<string, { name: string }>, zi: number) => byId.get(H.zones[zi])?.name ?? H.zones[zi];
const hh = (h: number) => (h < 0 ? "–" : `${String(h).padStart(2, "0")}:00`);

const DAYPARTS: { label: string; from: number; to: number }[] = [
  { label: "Noc 0–6", from: 0, to: 6 },
  { label: "Ráno 6–10", from: 6, to: 10 },
  { label: "Den 10–15", from: 10, to: 15 },
  { label: "Odpoledne 15–19", from: 15, to: 19 },
  { label: "Večer 19–24", from: 19, to: 24 },
];

export function HistoryTab({ params, jobs }: Props) {
  const [sel, setSel] = useState(() => new Date());
  const today = isoLocal(new Date());
  const selIso = isoLocal(sel);

  // Běžný den v týdnu = průměr dnů, které nejsou svátek / Vánoce / konec roku.
  const stats = useMemo(() => {
    const sums = new Array(7).fill(0);
    const ns = new Array(7).fill(0);
    const kinds = H.daily.map((_, i) => dayKind(dayAt(i)));
    H.daily.forEach((n, i) => {
      if (kinds[i].kind) return;
      const wd = (dayAt(i).getDay() + 6) % 7;
      sums[wd] += n;
      ns[wd] += 1;
    });
    const base = sums.map((s, i) => (ns[i] ? s / ns[i] : 0));
    const ratio = (i: number) => {
      const b = base[(dayAt(i).getDay() + 6) % 7];
      return b > 0 ? H.daily[i] / b : 1;
    };
    const worst = H.daily
      .map((n, i) => ({ i, n, r: ratio(i) }))
      .sort((a, b) => b.r - a.r)
      .slice(0, 5);
    const counts = new Map(H.daily.map((n, i) => [isoLocal(dayAt(i)), n]));
    const years = [...new Set(H.daily.map((_, i) => dayAt(i).getFullYear()))];
    return { base, kinds, ratio, worst, counts, years };
  }, []);
  const [year, setYear] = useState(() => stats.years[stats.years.length - 1]);

  const zoneById = useMemo(() => new Map(params.zones.map((z) => [z.id, z])), [params.zones]);

  // Stejné datum v minulých letech (29. 2. jen v přestupném roce).
  const past = useMemo(() => {
    const out: { date: Date; i: number; n: number; base: number; name: string | null; events: number[][] }[] = [];
    for (let k = 1; k <= 5; k++) {
      const date = new Date(sel.getFullYear() - k, sel.getMonth(), sel.getDate());
      if (date.getMonth() !== sel.getMonth()) continue;
      const i = indexOf(date);
      if (i < 0 || i >= H.daily.length) continue;
      const wd = (date.getDay() + 6) % 7;
      out.push({
        date,
        i,
        n: H.daily[i],
        base: stats.base[wd],
        name: stats.kinds[i].name,
        events: H.events.filter((e) => e[0] === i),
      });
    }
    return out;
  }, [sel, stats]);

  // Mapa: nehody na síti ± WINDOW dní kolem data v minulých letech.
  const { dots, zones, windowCount } = useMemo(() => {
    const idx = new Set<number>();
    for (const p of past) for (let o = -WINDOW; o <= WINDOW; o++) idx.add(p.i + o);
    const evs = H.events.filter((e) => idx.has(e[0]));
    const perZone = new Map<number, number>();
    for (const e of evs) perZone.set(e[2], (perZone.get(e[2]) ?? 0) + 1);
    const max = Math.max(1, ...perZone.values());
    const zones: MapZone[] = H.zones.flatMap((id, zi) => {
      const z = zoneById.get(id);
      if (!z?.geo) return [];
      const n = perZone.get(zi) ?? 0;
      return [{
        id,
        path: z.geo.path,
        color: heatColor(n / max),
        tooltip: `<b>${z.name}</b><br>${n} ${plural(n, "nehoda", "nehody", "nehod")} v okně`,
        dim: n === 0,
      }];
    });
    const dots: MapDot[] = evs.map((e, k) => {
      const d = dayAt(e[0]);
      return {
        id: `h${k}`,
        pos: { lat: (e[3] + 500000) / 1e4, lng: (e[4] + 140000) / 1e4 },
        color: DOT,
        tooltip: `<b>${DAY_SHORT[(d.getDay() + 6) % 7]} ${dateLabel(isoLocal(d))} ${d.getFullYear()}</b> ${hh(e[1])}<br>${zoneNameOf(zoneById, e[2])}`,
      };
    });
    return { dots, zones, windowCount: evs.length };
  }, [past, zoneById]);

  const cal = params.calendar;
  const shift = (days: number) => setSel((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
  const selWd = (sel.getDay() + 6) % 7;
  const selKind = dayKind(sel);

  // Vlastní výjezdy: úspěšnost po stanovištích a částech dne.
  const jobStats = useMemo(() => {
    const valid = jobs.filter((j) => !isNaN(new Date(j.calledAt).getTime()));
    const group = <K,>(key: (j: JobLog) => K) => {
      const m = new Map<K, { n: number; won: number; travel: number }>();
      for (const j of valid) {
        const k = key(j);
        const s = m.get(k) ?? { n: 0, won: 0, travel: 0 };
        s.n += 1;
        s.won += j.result === "won" ? 1 : 0;
        s.travel += j.travelMinutes;
        m.set(k, s);
      }
      return m;
    };
    const byStand = [...group((j) => j.standId).entries()].sort((a, b) => b[1].n - a[1].n);
    const byPart = group((j) => {
      const h = new Date(j.calledAt).getHours();
      return DAYPARTS.findIndex((p) => h >= p.from && h < p.to);
    });
    return { n: valid.length, byStand, byPart };
  }, [jobs]);
  const standName = (id: string) => params.stands.find((s) => s.id === id)?.name ?? id;

  return (
    <>
      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Tento den v minulých letech</div>
        </div>
        <div className="pr-hour pr-hist-date">
          <button className="pr-step" onClick={() => shift(-1)} aria-label="Předchozí den">
            <ChevronLeft size={20} />
          </button>
          <div className="pr-hour-val">
            {DAY_LONG[selWd]} {dateLabel(selIso)}
            {selKind.name && <span className="pr-hist-hol">{selKind.name}</span>}
          </div>
          <button className="pr-step" onClick={() => shift(1)} aria-label="Další den">
            <ChevronRight size={20} />
          </button>
          <button className={"pr-now" + (selIso === today ? " is-active" : "")} onClick={() => setSel(new Date())} disabled={selIso === today}>
            <Clock size={15} /> Dnes
          </button>
        </div>

        {past.length === 0 ? (
          <div className="pr-note">Pro toto datum nejsou v datech předchozí roky.</div>
        ) : (
          <ul className="pr-hist-years">
            {past.map((p) => {
              const wd = (p.date.getDay() + 6) % 7;
              return (
                <li key={p.i}>
                  <div className="pr-hist-row">
                    <span className="pr-hist-year mono">{p.date.getFullYear()}</span>
                    <span className="pr-hist-when">
                      {DAY_SHORT[wd]} {dateLabel(isoLocal(p.date))}
                      {p.name && <span className="pr-hist-hol">{p.name}</span>}
                    </span>
                    <span className="pr-hist-val mono">{p.n}</span>
                    <span className={"pr-hist-diff mono" + (p.n >= p.base ? " is-up" : " is-down")}>
                      {p.base > 0 ? signed(p.n / p.base) : "–"}
                    </span>
                  </div>
                  <div className="pr-hist-sub">
                    {p.events.length === 0
                      ? "Na síti bez nehody."
                      : `Na síti: ${p.events.map((e) => `${hh(e[1])} ${zoneNameOf(zoneById, e[2])}`).join(" · ")}`}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="pr-note">
          Číslo = nehody v celé Praze, procenta proti běžnému dni stejného dne v týdnu (bez svátků).
        </div>

        {past.length > 0 && (
          <>
            <div className="pr-zones-head">
              Nehody na síti ±{WINDOW} dny kolem data · {windowCount}
            </div>
            <div className="pr-map-wrap">
              <PragueMap zones={zones} stands={NO_STANDS} dots={dots} />
            </div>
          </>
        )}
      </section>

      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Kalendář nehod v Praze</div>
          <div className="od-switch" role="tablist" aria-label="Rok">
            {stats.years.map((y) => (
              <button
                key={y}
                role="tab"
                aria-selected={year === y}
                className={"od-switch-btn" + (year === y ? " is-active" : "")}
                onClick={() => setYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
        <ActivityHeatmap
          counts={stats.counts}
          year={year}
          unitLabel="Nehody"
          dayNote={(iso) => {
            const [y, m, d] = iso.split("-").map(Number);
            return dayKind(new Date(y, m - 1, d)).name;
          }}
          footText={`${H.source} · ${H.daily.reduce((a, b) => a + b, 0).toLocaleString("cs-CZ")} nehod`}
        />
      </section>

      {cal && (
        <section className="od-panel">
          <div className="od-panel-head">
            <div className="od-panel-title">Svátky a sezóna</div>
          </div>
          <div className="pr-hist-kinds">
            {([
              ["holiday", "Státní svátek"],
              ["christmas", "Vánoce 24.–26. 12."],
              ["yearEnd", "Konec roku 27. 12.–1. 1."],
            ] as const).map(([k, label]) => (
              <div key={k} className="pr-hist-kind">
                <span>{label}</span>
                <b className="mono">{signed(cal[k])}</b>
              </div>
            ))}
          </div>
          <div className="pr-zones-head">Měsíce proti průměru roku</div>
          <ul className="pr-hist-months">
            {cal.month.map((f, m) => (
              <li key={m} className={m === new Date().getMonth() ? "is-now" : ""}>
                <span className="pr-hist-mname">{MONTHS[m]}</span>
                <span className="pr-hist-mbar">
                  <span
                    className={f >= 1 ? "is-up" : "is-down"}
                    style={{ width: `${Math.min(50, Math.abs(f - 1) * 250)}%`, [f >= 1 ? "left" : "right"]: "50%" }}
                  />
                </span>
                <span className="pr-hist-mval mono">{signed(f)}</span>
              </li>
            ))}
          </ul>
          <div className="pr-zones-head">Nejhorší dny</div>
          <ol className="pr-top">
            {stats.worst.map((w, r) => {
              const d = dayAt(w.i);
              return (
                <li key={w.i}>
                  <button onClick={() => { setSel(new Date(new Date().getFullYear(), d.getMonth(), d.getDate())); window.scrollTo(0, 0); }}>
                    <span className="pr-top-n mono">{r + 1}</span>
                    <span className="pr-top-main">
                      <span className="pr-top-when">{DAY_LONG[(d.getDay() + 6) % 7]} {dateLabel(isoLocal(d))} {d.getFullYear()}</span>
                      <span className="pr-top-where">{w.n} {plural(w.n, "nehoda", "nehody", "nehod")} · běžně {Math.round(w.n / w.r)}</span>
                    </span>
                    <span className="pr-top-val mono">{signed(w.r)}</span>
                    <ChevronRight size={17} className="od-menu-chev" />
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="pr-note">
            Model s tím počítá: v Teď a Týden se poptávka násobí podle data. Nejhorší dny bývají první sníh nebo náledí – počasí model zatím nezná.
          </div>
        </section>
      )}

      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Moje výjezdy</div>
        </div>
        {jobStats.n === 0 ? (
          <div className="pr-note">Zatím žádné výjezdy. Zapisujte je v Přidat → Výjezd, tady pak uvidíte, odkud a kdy získáváte nejvíc.</div>
        ) : (
          <>
            <div className="pr-zones-head">Podle stanoviště</div>
            <ul className="pr-rank">
              {jobStats.byStand.map(([id, s]) => (
                <li key={id}>
                  <span className="pr-rank-id">{id}</span>
                  <div className="pr-rank-main">
                    <div className="pr-rank-top">
                      <span className="pr-rank-name">{standName(id)}</span>
                      <span className="pr-rank-val mono">{pct(s.won / s.n)}</span>
                    </div>
                    <div className="pr-bar">
                      <span style={{ width: `${(s.won / s.n) * 100}%` }} />
                    </div>
                    <div className="pr-rank-sub mono">
                      {s.n} {plural(s.n, "výjezd", "výjezdy", "výjezdů")} · {s.won} získáno · Ø dojezd {num1(s.travel / s.n)} min
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="pr-zones-head">Podle části dne</div>
            <ul className="pr-hist-parts">
              {DAYPARTS.map((p, i) => {
                const s = jobStats.byPart.get(i);
                return (
                  <li key={p.label}>
                    <span>{p.label}</span>
                    <span className="mono">{s ? `${s.n}×` : "–"}</span>
                    <span className="mono" style={{ color: s ? (s.won / s.n >= 0.5 ? WON : LOST) : undefined }}>
                      {s ? pct(s.won / s.n) : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
