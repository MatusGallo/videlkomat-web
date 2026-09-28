import { useMemo, useRef, useState } from "react";
import type { DemandZone, GeoPoint, JobLog, JobResult, ModelParams } from "../../predict/types";
import { evaluate, probAtLeastOne, shiftPlan, zoneDemand, corridorTravel, standReach } from "../../predict/model";
import { DAY_LONG, DAY_SHORT, RESULT_LABEL, hourRange, shortZoneName } from "../../predict/labels";
import { dayInfo, isoLocal } from "../../predict/calendar";
import { distanceKm, hash01, moveMinutes, pointAlong, pointToPathKm } from "../../predict/geo";
import type { GeoState } from "../../hooks/useGeoPosition";
import { dateLabel, num1, todayISO } from "../../utils/format";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Clock, Check } from "../../icons";
import { ROAD_ORDER } from "../../predict/demoParams";
import { MONTHS } from "../../constants";
import { heatColor, heatGradient, pct } from "./heat";
import { PragueMap, type MapDot, type MapStand, type MapZone } from "./PragueMap";
import { DayTimeline } from "./DayTimeline";
import { StandReach, ZoneDetail } from "./MapDetail";
import { ShiftPlan, type AlertsState } from "./ShiftPlan";
import { NowHero } from "./NowHero";
import { LEVEL_LABEL, chanceLevel, levelScale } from "../../predict/level";
import { useWakeLock } from "../../hooks/useWakeLock";
import type { ActiveJobState } from "../../hooks/useActiveJob";

// Předvyplnění zápisu výjezdu (z mapy, nebo z rozjetého výjezdu v hlavní kartě).
export type JobPreset = {
  zoneId?: string;
  geo?: GeoPoint;
  standId?: string;
  travelMinutes?: number;
  result?: JobResult;
  calledAt?: string;
  // Z rozjetého výjezdu – po uložení se ukončí.
  fromActive?: boolean;
};

type Props = {
  params: ModelParams;
  // Data nejbližších 7 dnů podle dne v týdnu (Po = 0).
  dates: Date[];
  jobs: JobLog[];
  d: number;
  h: number;
  onDay: (d: number) => void;
  onHour: (h: number) => void;
  onNow: () => void;
  isNow: boolean;
  onAddJob: (preset: JobPreset) => void;
  activeJob: ActiveJobState;
  alerts: AlertsState;
  geo: GeoState;
};

type Selection = { kind: "zone" | "stand"; id: string } | null;

const num2 = (n: number): string =>
  new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const TOP_ZONES = 6;
const WON = "#5ed18a";
const LOST = "#e8624a";

// „o 36 % méně" / „o 14 % víc" proti běžnému dni.
const diffTxt = (f: number): string => `o ${Math.round(Math.abs(f - 1) * 100)}\u00a0% ${f < 1 ? "méně" : "víc"}`;

export function NowTab({ params, dates, jobs, d, h, onDay, onHour, onNow, isNow, onAddJob, activeJob, alerts, geo }: Props) {
  const [shiftHours, setShiftHours] = useState(8);
  const [sel, setSel] = useState<Selection>(null);
  const [showJobs, setShowJobs] = useState(true);
  const [allZones, setAllZones] = useState(false);
  // Filtr silnice (null = celá síť).
  const [road, setRoad] = useState<string | null>(null);
  // Výběr jiného dne / hodiny je sbalený – ve voze je důležité „teď".
  const [planOpen, setPlanOpen] = useState(false);
  const [allStands, setAllStands] = useState(false);
  const wake = useWakeLock(isNow);
  const mapPanelRef = useRef<HTMLElement>(null);

  const ev = useMemo(() => evaluate(params, d, h), [params, d, h]);
  // Za směnu počítáme podle plánu s cenou přesunů (realističtější než součet maxim).
  // Moje poloha: nejbližší úsek a kam se přesunout.
  const gps = useMemo(() => {
    if (!geo.pos) return null;
    const p = geo.pos.pos;
    let zone: DemandZone | null = null;
    let zoneKm = Infinity;
    for (const z of params.zones) {
      if (!z.geo) continue;
      const k = pointToPathKm(p, z.geo.path);
      if (k < zoneKm) { zoneKm = k; zone = z; }
    }
    return { p, zone, zoneKm };
  }, [geo.pos, params.zones]);
  // Se zapnutou polohou začíná plán tam, kde řidič je: první hodina počítá s cestou
  // odsud, takže po zakázce za Prahou může vyjít čekat poblíž místo návratu.
  const startMove = useMemo(
    () => (gps && isNow ? params.stands.map((st) => (st.geo ? moveMinutes(gps.p, st.geo) : Infinity)) : undefined),
    [gps, isNow, params.stands],
  );
  const plan = useMemo(() => shiftPlan(params, d, h, shiftHours, { startMove }), [params, d, h, shiftHours, startMove]);
  // Slovní úroveň šance proti hodinám týdne.
  const scale = useMemo(() => levelScale(params), [params]);
  // Barvy úseků se vztahují k nejvyšší poptávce v týdnu – ať je vidět, že je
  // v noci klid, a ne jen poměr úseků mezi sebou.
  const maxLam = useMemo(() => {
    let m = 0;
    for (let dd = 0; dd < 7; dd++)
      for (let hh = 0; hh < 24; hh++)
        for (const z of params.zones) m = Math.max(m, zoneDemand(params, z, dd, hh));
    return m;
  }, [params]);

  const today = todayISO();
  const activeAlerts = useMemo(
    () => new Map(params.alerts.filter((a) => a.until >= today).map((a) => [a.zoneId, a.label])),
    [params.alerts, today],
  );

  // Konkrétní datum vybraného dne: svátek a měsíc mění poptávku.
  const day = dayInfo(params, dates[d]);
  const dayDate = dateLabel(isoLocal(day.date));
  const cal = params.calendar;
  const dayNote = day.kind && cal
    ? `${day.name}: nehod bývá ${diffTxt(cal[day.kind])} než běžně.`
    : cal && Math.abs(day.monthFactor - 1) >= 0.05
      ? `${MONTHS[day.date.getMonth()]}: nehod ${diffTxt(day.monthFactor)} než v průměru roku.`
      : null;

  // Doporučené stanoviště: z plánu (s cenou cesty z mé polohy), jinak nejlepší v hodině.
  const heroIdx = startMove && (plan.hours[0]?.best ?? -1) >= 0 ? plan.hours[0].best : ev.best;
  const best = heroIdx >= 0 ? params.stands[heroIdx] : null;
  const bestScore = best ? ev.scores[heroIdx] : 0;
  const ranking = params.stands
    .map((st, i) => ({ st, score: ev.scores[i], i }))
    .sort((a, b) => b.score - a.score);
  const lamSum = ev.lam.reduce((a, b) => a + b, 0);
  const zoneColor = (i: number) => heatColor(maxLam > 0 ? ev.lam[i] / maxLam : 0);

  // Režim dosahu: vybrané stanoviště přebarví úseky podle šance dorazit první.
  const reachStand = sel?.kind === "stand" ? params.stands.find((s) => s.id === sel.id) ?? null : null;
  const reach = useMemo(() => (reachStand ? standReach(params, reachStand, d, h) : null), [params, reachStand, d, h]);

  const hasGeo = params.zones.some((z) => z.geo && z.geo.path.length > 1);
  const mapZones = useMemo<MapZone[]>(
    () =>
      params.zones.flatMap((z, i) => {
        if (!z.geo) return [];
        const T = best ? corridorTravel(params, best, z, d, h) : Infinity;
        const tip = reach
          ? `<b>${z.name}</b><br>z ${reachStand?.id}: ${Number.isFinite(reach[i].minutes) ? Math.round(reach[i].minutes) + " min" : "nedosažitelné"} · šance ${pct(reach[i].capture)}`
          : `<b>${z.name}</b><br>${num2(ev.lam[i])} událostí/h${Number.isFinite(T) ? ` · z ${best?.id} ${Math.round(T)} min` : ""}`;
        return [{
          id: z.id,
          path: z.geo.path,
          color: reach ? heatColor(reach[i].capture) : heatColor(maxLam > 0 ? ev.lam[i] / maxLam : 0),
          tooltip: tip,
          selected: sel?.kind === "zone" && sel.id === z.id,
          alert: activeAlerts.get(z.id),
          dim: road !== null && z.road !== road,
        }];
      }),
    [params, ev, best, maxLam, d, h, reach, reachStand, sel, activeAlerts, road],
  );
  const mapStands = useMemo<MapStand[]>(
    () =>
      params.stands.flatMap((s, i) =>
        s.geo
          ? [{
              id: s.id,
              pos: s.geo,
              best: i === heroIdx,
              label: i === heroIdx ? s.name : undefined,
              selected: sel?.kind === "stand" && sel.id === s.id,
              tooltip: `<b>${s.id} · ${s.name}</b><br>šance ${pct(probAtLeastOne(ev.scores[i]))} · klepněte pro dosah`,
            }]
          : [],
      ),
    [params, ev, sel, heroIdx],
  );
  // Vlastní výjezdy: s polohou z mapy přesně, jinak rozprostřené po svém úseku.
  const jobDots = useMemo<MapDot[]>(() => {
    if (!showJobs) return [];
    return jobs.flatMap((j) => {
      let pos: GeoPoint | null = j.lat != null && j.lng != null ? { lat: j.lat, lng: j.lng } : null;
      if (!pos) {
        const z = params.zones.find((zz) => zz.id === j.segmentId);
        pos = z?.geo ? pointAlong(z.geo.path, 0.08 + 0.84 * hash01(j.id)) : null;
      }
      if (!pos) return [];
      const when = new Date(j.calledAt);
      const label = isNaN(when.getTime()) ? "" : `${dateLabel(j.calledAt.slice(0, 10))} ${when.getHours()}:${String(when.getMinutes()).padStart(2, "0")} · `;
      return [{
        id: j.id,
        pos,
        color: j.result === "won" ? WON : LOST,
        tooltip: `<b>${RESULT_LABEL[j.result]}</b><br>${label}dojezd ${num1(j.travelMinutes)} min z ${j.standId}`,
      }];
    });
  }, [jobs, params.zones, showJobs]);
  const wonCount = jobs.filter((j) => j.result === "won").length;

  const toggleSel = (kind: "zone" | "stand", id: string) =>
    setSel((cur) => (cur && cur.kind === kind && cur.id === id ? null : { kind, id }));

  // Seznam úseků: nejvytíženější teď, nebo všechny seskupené podle silnice.
  const topZones = params.zones
    .map((_, i) => i)
    .filter((i) => road === null || params.zones[i].road === road)
    .sort((a, b) => ev.lam[b] - ev.lam[a])
    .slice(0, TOP_ZONES);
  const roads = useMemo(() => {
    const m = new Map<string, number[]>();
    params.zones.forEach((z, i) => {
      const r = z.road ?? "Ostatní";
      m.set(r, [...(m.get(r) ?? []), i]);
    });
    const rank = (r: string) => (ROAD_ORDER.indexOf(r) + 1 || 99);
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [params.zones]);
  const shownRoads = road === null ? roads : roads.filter(([r]) => r === road);
  const focus = useMemo(() => {
    const zs = params.zones.filter((z) => z.geo && (road === null || z.road === road));
    return { key: road ?? "all", points: zs.flatMap((z) => z.geo!.path) };
  }, [params.zones, road]);

  const gpsMove = gps && best?.geo ? moveMinutes(gps.p, best.geo) : null;
  const atBest = gps && best?.geo ? distanceKm(gps.p, best.geo) < 0.3 : false;
  const gpsWhere = !gps
    ? null
    : gps.zone && gps.zoneKm < 0.5
      ? `Jste na úseku ${gps.zone.name}`
      : gps.zone
        ? `Nejbližší úsek ${gps.zone.name} (${num1(gps.zoneKm)} km)`
        : null;
  const bestProb = probAtLeastOne(bestScore);
  // Průměrný dojezd na úseky vážený poptávkou – řidič vidí, proč je stanoviště dole.
  const avgTravel = (st: (typeof params.stands)[number]) =>
    lamSum > 0 ? params.zones.reduce((s, z, zi) => s + ev.lam[zi] * corridorTravel(params, st, z, d, h), 0) / lamSum : NaN;
  const bestAvg = best ? avgTravel(best) : NaN;
  const shownRanking = allStands ? ranking : ranking.slice(0, 3);

  // Rozjetý výjezd → zápis s předvyplněným časem vyjetí, stanovištěm a změřeným
  // dojezdem. U získané zakázky jsem na místě, takže úsek a místo vezmu z polohy.
  const finishJob = (result: JobResult) => {
    const aj = activeJob.job;
    if (!aj) return;
    const minutes = Math.max(1, Math.round((Date.now() - new Date(aj.startedAt).getTime()) / 6000) / 10);
    const here = result === "won" && gps && gps.zone && gps.zoneKm < 1 ? gps : null;
    onAddJob({
      fromActive: true,
      standId: aj.standId,
      calledAt: aj.startedAt,
      travelMinutes: minutes,
      result,
      zoneId: here?.zone?.id,
      geo: here?.p,
    });
  };
  const openPlanner = planOpen || !isNow;
  const zoneRow = (i: number, short = false) => {
    const z = params.zones[i];
    return (
      <li key={z.id}>
        <button className="pr-zone-btn" onClick={() => toggleSel("zone", z.id)}>
          <span className="pr-swatch" style={{ background: zoneColor(i) }} />
          <span className="pr-zone-name">{short ? shortZoneName(z) : z.name}</span>
          {activeAlerts.has(z.id) && <span className="pr-zone-warn" title={activeAlerts.get(z.id)}>⚠</span>}
          <span className="pr-zone-val mono">{lamSum > 0 ? pct(ev.lam[i] / lamSum) : "–"}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      <NowHero
        stand={best}
        prob={bestProb}
        level={chanceLevel(bestProb, scale)}
        dayLabel={`${DAY_SHORT[d]} ${dayDate}`}
        h={h}
        isNow={isNow}
        dayNote={day.kind ? dayNote : null}
        blocks={plan.blocks}
        standName={(i) => params.stands[i]?.name ?? "–"}
        shiftHours={shiftHours}
        gpsMinutes={gpsMove}
        atStand={atBest}
        gpsWhere={gpsWhere}
        geo={geo}
        wake={wake}
        activeJob={activeJob.job}
        activeStandName={params.stands.find((s) => s.id === activeJob.job?.standId)?.name ?? activeJob.job?.standId ?? ""}
        onStartJob={() => {
          // Vyjíždím z místa, kde stojím (do 1,5 km), jinak z doporučeného.
          const near = gps
            ? params.stands.reduce<{ id: string; km: number } | null>((acc, st) => {
                const km = st.geo ? distanceKm(gps.p, st.geo) : Infinity;
                return km < 1.5 && (!acc || km < acc.km) ? { id: st.id, km } : acc;
              }, null)
            : null;
          const from = near?.id ?? best?.id;
          if (from) activeJob.start(from);
        }}
        onFinishJob={finishJob}
        onCancelJob={activeJob.clear}
      />

      {isNow && (
        <button className="pr-more pr-plan-open" onClick={() => setPlanOpen((v) => !v)} aria-expanded={planOpen}>
          <CalendarClock size={16} /> {planOpen ? "Skrýt plánování" : "Plánovat jiný den nebo hodinu"}
          <ChevronDown size={16} className={planOpen ? "is-open" : ""} />
        </button>
      )}
      {openPlanner && (
        <section className="od-panel pr-controls">
          <div className="od-switch pr-days" role="tablist" aria-label="Den v týdnu">
            {DAY_SHORT.map((lbl, i) => {
              const k = dayInfo(params, dates[i]);
              return (
                <button
                  key={i}
                  role="tab"
                  aria-selected={d === i}
                  className={"od-switch-btn" + (d === i ? " is-active" : "") + (k.kind ? " pr-day-hol" : "")}
                  title={`${DAY_LONG[i]} ${dateLabel(isoLocal(k.date))}${k.name ? " · " + k.name : ""}`}
                  onClick={() => onDay(i)}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
          <div className="pr-hour">
            <button className="pr-step" onClick={() => onHour((h + 23) % 24)} aria-label="Předchozí hodina">
              <ChevronLeft size={20} />
            </button>
            <div className="pr-hour-val mono">{hourRange(h)}</div>
            <button className="pr-step" onClick={() => onHour((h + 1) % 24)} aria-label="Další hodina">
              <ChevronRight size={20} />
            </button>
            <button
              className={"pr-now" + (isNow ? " is-active" : "")}
              onClick={() => {
                onNow();
                setPlanOpen(false);
              }}
              disabled={isNow}
            >
              <Clock size={15} /> Teď
            </button>
          </div>
          <div className={"pr-daynote" + (day.kind ? " is-special" : "")}>
            <span className="pr-daynote-date">{DAY_LONG[d]} {dayDate}</span>
            {dayNote ? <span>{dayNote}</span> : <span>Běžný den.</span>}
          </div>
        </section>
      )}

      <section className="od-panel" ref={mapPanelRef}>
        <div className="od-panel-head">
          <div className="od-panel-title">{hasGeo ? "Mapa" : "Koridor"}</div>
          <div className="pr-legend">
            <span>{reach ? "pozdě" : "klid"}</span>
            <span className="pr-legend-bar" style={{ background: heatGradient() }} />
            <span>{reach ? "dorazím první" : "vysoká poptávka"}</span>
          </div>
        </div>
        {hasGeo ? (
          <>
            <div className="pr-chips" role="group" aria-label="Filtr silnice">
              {[null, ...roads.map(([r]) => r)].map((r) => (
                <button
                  key={r ?? "all"}
                  className={"pr-chip" + (road === r ? " is-active" : "")}
                  onClick={() => {
                    setRoad(r);
                    setSel(null);
                  }}
                  aria-pressed={road === r}
                >
                  {r ?? "Celá síť"}
                </button>
              ))}
            </div>
            <div className="pr-map-wrap">
            <PragueMap
              zones={mapZones}
              stands={mapStands}
              dots={jobDots}
              me={geo.pos ? { pos: geo.pos.pos, accuracy: geo.pos.accuracy } : null}
              focus={focus}
              onZoneClick={(id) => toggleSel("zone", id)}
              onStandClick={(id) => toggleSel("stand", id)}
              onBackgroundClick={() => setSel(null)}
              onZoneHold={(zoneId, p) => onAddJob({ zoneId, geo: p })}
            />
            </div>
            <div className="pr-map-bar">
              <span className="pr-note pr-map-help">
                Klepněte na úsek pro detail, na stanoviště pro jeho dosah. Podržením prstu na úseku zapíšete výjezd.
              </span>
              {jobs.length > 0 && (
                <label className="od-check pr-jobs-toggle">
                  <input type="checkbox" checked={showJobs} onChange={(e) => setShowJobs(e.target.checked)} />
                  <span className="od-check-box" aria-hidden="true">{showJobs && <Check size={13} />}</span>
                  <span>
                    Moje výjezdy
                    <span className="pr-dot" style={{ background: WON }} /> {wonCount} získáno
                    <span className="pr-dot" style={{ background: LOST }} /> {jobs.length - wonCount} předběhnut
                  </span>
                </label>
              )}
            </div>
          </>
        ) : (
          <div className="pr-corridor">
            <div className="pr-pins">
              {params.stands.map((st, i) =>
                st.schema ? (
                  <span
                    key={st.id}
                    className={"pr-pin" + (i === ev.best ? " is-best" : "")}
                    style={{ left: `${st.schema.x * 100}%` }}
                    title={st.name}
                  >
                    {st.id}
                  </span>
                ) : null,
              )}
            </div>
            <div className="pr-road">
              {params.zones.map((z, i) => {
                const span = z.schema ?? { from: i / params.zones.length, to: (i + 1) / params.zones.length };
                return (
                  <span
                    key={z.id}
                    className="pr-seg"
                    style={{ left: `${span.from * 100}%`, width: `${(span.to - span.from) * 100}%`, background: zoneColor(i) }}
                    title={`${z.name}: ${num1(ev.lam[i])} událostí/h`}
                  />
                );
              })}
            </div>
          </div>
        )}

        <DayTimeline params={params} d={d} h={h} onHour={onHour} />

        {sel?.kind === "zone" ? (
          <ZoneDetail
            params={params}
            zoneId={sel.id}
            d={d}
            h={h}
            alert={activeAlerts.get(sel.id)}
            onHour={onHour}
            onAddJob={() => onAddJob({ zoneId: sel.id })}
            onClose={() => setSel(null)}
          />
        ) : sel?.kind === "stand" ? (
          <StandReach params={params} standId={sel.id} d={d} h={h} onClose={() => setSel(null)} />
        ) : (
          <>
            <div className="pr-zones-head">
              {allZones ? "Všechny úseky" : "Nejvyšší poptávka teď"} <span className="pr-zones-unit">· podíl na síti</span>
            </div>
            {allZones ? (
              shownRoads.map(([r, idxs]) => (
                <div key={r} className="pr-zones-group">
                  <div className="pr-zones-road">{r}</div>
                  <ul className="pr-zones">{idxs.map((i) => zoneRow(i, true))}</ul>
                </div>
              ))
            ) : (
              <ul className="pr-zones">{topZones.map((i) => zoneRow(i))}</ul>
            )}
            {params.zones.length > TOP_ZONES && (
              <button className="pr-more" onClick={() => setAllZones((v) => !v)} aria-expanded={allZones}>
                <ChevronDown size={16} className={allZones ? "is-open" : ""} />
                {allZones ? "Jen nejvytíženější" : `Všechny úseky (${params.zones.length})`}
              </button>
            )}
          </>
        )}
      </section>

      <ShiftPlan params={params} d={d} h={h} hours={shiftHours} onHours={setShiftHours} alerts={alerts} startMove={startMove} />

      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Pořadí stanovišť</div>
        </div>
        <ul className="pr-rank">
          {shownRanking.map(({ st, score }, r) => {
            const avgT = avgTravel(st);
            const p = probAtLeastOne(score);
            const lvl = chanceLevel(p, scale);
            const slower = r > 0 && Number.isFinite(avgT) && Number.isFinite(bestAvg) ? Math.round(avgT - bestAvg) : 0;
            return (
              <li key={st.id} className={r === 0 ? "is-best" : ""}>
                <button
                  className="pr-rank-btn"
                  onClick={() => {
                    toggleSel("stand", st.id);
                    mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  aria-label={`Zobrazit dosah ${st.name} na mapě`}
                >
                  <span className="pr-rank-id">{st.id}</span>
                  <div className="pr-rank-main">
                    <div className="pr-rank-top">
                      <span className="pr-rank-name">{st.name}</span>
                      <span className={"pr-rank-val mono pr-level-txt is-" + lvl}>{LEVEL_LABEL[lvl]} · {pct(p)}</span>
                    </div>
                    <div className="pr-bar">
                      <span style={{ width: `${ranking[0]?.score > 0 ? (score / ranking[0].score) * 100 : 0}%` }} />
                    </div>
                    <div className="pr-rank-sub mono">
                      {Number.isFinite(avgT) ? `Ø dojezd ${Math.round(avgT)} min` : "bez dojezdů"}
                      {slower >= 3 && ` · o ${slower} min dál od poptávky než ${ranking[0].st.id}`}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {ranking.length > 3 && (
          <button className="pr-more" onClick={() => setAllStands((v) => !v)} aria-expanded={allStands}>
            <ChevronDown size={16} className={allStands ? "is-open" : ""} />
            {allStands ? "Jen nejlepší 3" : `Všechna stanoviště (${ranking.length})`}
          </button>
        )}
        <p className="pr-note">
          Klepnutím zobrazíte dosah stanoviště na mapě. Procenta jsou šance na nehodu evidovanou policií v dosahu
          během hodiny – skutečných zakázek je víc, proto úroveň (Vysoká / Střední / Klid) porovnává hodinu se
          zbytkem týdne.
        </p>
      </section>
    </>
  );
}
