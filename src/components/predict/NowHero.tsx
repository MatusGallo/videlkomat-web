import { useEffect, useState } from "react";
import type { JobResult, Stand } from "../../predict/types";
import type { ActiveJob } from "../../hooks/useActiveJob";
import type { PlanBlock } from "../../predict/model";
import { hourLabel, hourRange } from "../../predict/labels";
import { LEVEL_LABEL, type ChanceLevel } from "../../predict/level";
import { googleNavUrl, wazeNavUrl } from "../../predict/geo";
import type { GeoState } from "../../hooks/useGeoPosition";
import type { WakeState } from "../../hooks/useWakeLock";
import { Check, Crosshair, Navigation, Truck, X } from "../../icons";
import { pct } from "./heat";

type Props = {
  stand: Stand | null;
  prob: number;
  level: ChanceLevel;
  // „Po 28. 9." vybraného dne a hodina.
  dayLabel: string;
  h: number;
  isNow: boolean;
  // Svátek / výrazný měsíc (jinak null).
  dayNote: string | null;
  // Plán směny od vybrané hodiny: první blok = teď, druhý = další přesun.
  blocks: PlanBlock[];
  standName: (index: number) => string;
  shiftHours: number;
  // Moje poloha: minuty k doporučenému stanovišti a zda už tam jsem.
  gpsMinutes: number | null;
  atStand: boolean;
  gpsWhere: string | null;
  geo: GeoState;
  wake: WakeState;
  // Rozjetý výjezd (Jedu na zakázku → Získáno / Předběhnut).
  activeJob: ActiveJob | null;
  activeStandName: string;
  onStartJob: () => void;
  onFinishJob: (result: JobResult) => void;
  onCancelJob: () => void;
};

// Minuty od vyjetí; obnovuje se každých 15 s.
function useElapsed(since: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [since]);
  return since ? Math.max(0, (now - new Date(since).getTime()) / 60000) : 0;
}

// Hlavní karta záložky Teď: kam jet, jak moc se to vyplatí a kdy dál.
// Čte se jedním pohledem ve voze; navigace otevře Google Maps / Waze.
export function NowHero({
  stand, prob, level, dayLabel, h, isNow, dayNote, blocks, standName, shiftHours,
  gpsMinutes, atStand, gpsWhere, geo, wake,
  activeJob, activeStandName, onStartJob, onFinishJob, onCancelJob,
}: Props) {
  const elapsed = useElapsed(activeJob?.startedAt ?? null);
  if (activeJob) {
    const at = new Date(activeJob.startedAt);
    return (
      <section className="od-panel pr-hero is-high pr-hero-job">
        <div className="pr-hero-top">
          <span className="pr-hero-when">
            Na cestě od {String(at.getHours()).padStart(2, "0")}:{String(at.getMinutes()).padStart(2, "0")} · z {activeStandName}
          </span>
        </div>
        <div className="pr-hero-lead">Jedete na zakázku</div>
        <div className="pr-hero-name">
          <Truck size={26} />
          <span className="mono">{Math.floor(elapsed)} min</span>
        </div>
        <p className="pr-note">
          Na místě klepněte na výsledek – čas vyjetí, stanoviště a dojezd se předvyplní
          {geo.on ? ", úsek podle polohy." : ". Se zapnutou polohou se doplní i úsek."}
        </p>
        <div className="pr-hero-acts">
          <button className="od-add pr-hero-nav" onClick={() => onFinishJob("won")}>
            <Check size={16} /> Získáno
          </button>
          <button className="od-modal-cancel pr-tool" onClick={() => onFinishJob("lost")}>
            Předběhnut
          </button>
          <button className="od-modal-cancel pr-tool" onClick={onCancelJob} aria-label="Zrušit výjezd">
            <X size={15} /> Zrušit
          </button>
          {geo.supported && !geo.on && (
            <button className="od-modal-cancel pr-tool pr-hero-gps" onClick={geo.toggle}>
              <Crosshair size={15} /> Zapnout polohu
            </button>
          )}
        </div>
        {geo.on && gpsWhere && <div className="pr-hero-where pr-hero-jobwhere">{gpsWhere}</div>}
        {geo.error && <div className="pr-note pr-gps-err">{geo.error}</div>}
      </section>
    );
  }
  if (!stand) {
    return (
      <section className="od-panel pr-hero">
        <div className="pr-hero-lead">Zatím nemáte žádné stanoviště.</div>
        <p className="pr-note">Přidejte místa, kde můžete čekat, v záložce Stanoviště.</p>
      </section>
    );
  }
  const next = blocks[1];
  const nextText = next
    ? `do ${hourLabel(next.h)}, pak ${standName(next.best)} (přesun ${Math.round(next.moveMinutes)} min)`
    : `celou směnu (${shiftHours} h) tady`;
  const lead = !isNow ? "V tu dobu buďte na" : atStand ? "Zůstaňte na" : "Jeďte na";

  return (
    <section className={"od-panel pr-hero is-" + level}>
      <div className="pr-hero-top">
        <span className="pr-hero-when">
          {isNow ? "Teď" : "Plán"} · {dayLabel} {hourRange(h)}
        </span>
        <span
          className={"pr-level is-" + level}
          title="Šance na aspoň jednu nehodu evidovanou policií v dosahu během hodiny. Skutečných zakázek je víc – úroveň ukazuje, jak silná je hodina proti zbytku týdne."
        >
          {LEVEL_LABEL[level]} · {pct(prob)}
        </span>
      </div>

      <div className="pr-hero-lead">{lead}</div>
      <div className="pr-hero-name">
        <span className="pr-rank-id">{stand.id}</span>
        <span>{stand.name}</span>
      </div>

      <ul className="pr-hero-facts">
        {isNow && gpsMinutes != null && !atStand && (
          <li>
            <b className="mono">~{Math.round(gpsMinutes)} min</b> od vás
          </li>
        )}
        {isNow && atStand && <li>Jste na místě</li>}
        <li>{nextText}</li>
        {isNow && gpsWhere && <li className="pr-hero-where">{gpsWhere}</li>}
      </ul>
      {dayNote && <div className="pr-hero-note">{dayNote}</div>}
      {geo.error && <div className="pr-note pr-gps-err">{geo.error}</div>}

      <div className="pr-hero-acts">
        {stand.geo && !atStand && (
          <>
            <a className="od-add pr-hero-nav" href={googleNavUrl(stand.geo)} target="_blank" rel="noopener noreferrer">
              <Navigation size={16} /> Navigovat
            </a>
            <a className="od-modal-cancel pr-tool" href={wazeNavUrl(stand.geo)} target="_blank" rel="noopener noreferrer">
              Waze
            </a>
          </>
        )}
        {isNow && (
          <button className="od-modal-cancel pr-tool" onClick={onStartJob}>
            <Truck size={15} /> Jedu na zakázku
          </button>
        )}
        {geo.supported && (
          <button
            className={"od-modal-cancel pr-tool pr-hero-gps" + (geo.on ? " is-on" : "")}
            onClick={geo.toggle}
            aria-pressed={geo.on}
          >
            <Crosshair size={15} /> {geo.on ? (geo.pos ? "Poloha zapnutá" : "Hledám…") : "Moje poloha"}
          </button>
        )}
      </div>

      {isNow && wake.supported && (
        <label className="od-check pr-hero-wake">
          <input type="checkbox" checked={wake.on} onChange={wake.toggle} />
          <span className="od-check-box" aria-hidden="true">{wake.on && <Check size={13} />}</span>
          <span>Nezhasínat displej, dokud čekám</span>
        </label>
      )}
    </section>
  );
}
