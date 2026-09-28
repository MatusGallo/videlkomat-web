import { useMemo } from "react";
import type { ModelParams } from "../../predict/types";
import { corridorTravel, captureProb, evaluate, probAtLeastOne, standReach, zoneDayProfile } from "../../predict/model";
import { DAY_LONG, hourLabel } from "../../predict/labels";
import { AlertTriangle, Plus, X } from "../../icons";
import { heatColor, pct } from "./heat";

const num2 = (n: number): string =>
  new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
// V dosahu ukazujeme nejbližší úseky (u celé sítě jich je přes 40).
const REACH_ROWS = 10;
const minutes = (T: number) => (Number.isFinite(T) ? `${Math.round(T)} min` : "nedosažitelné");

type ZoneProps = {
  params: ModelParams;
  zoneId: string;
  d: number;
  h: number;
  alert?: string;
  onHour: (h: number) => void;
  onAddJob: () => void;
  onClose: () => void;
};

// Detail úseku: poptávka přes den (klepnutím na sloupec změníte hodinu)
// a dojezdy ze všech stanovišť ve zvolenou hodinu.
export function ZoneDetail({ params, zoneId, d, h, alert, onHour, onAddJob, onClose }: ZoneProps) {
  const zone = params.zones.find((z) => z.id === zoneId);
  const profile = useMemo(() => (zone ? zoneDayProfile(params, zone, d) : []), [params, zone, d]);
  if (!zone) return null;
  const max = Math.max(...profile, 1e-9);
  const rows = params.stands
    .map((s) => {
      const T = corridorTravel(params, s, zone, d, h);
      return { s, T, p: captureProb(T, params.capture) };
    })
    .sort((a, b) => a.T - b.T);

  return (
    <div className="pr-detail">
      <div className="pr-detail-head">
        <div>
          <div className="pr-detail-kicker">Úsek</div>
          <div className="pr-detail-title">{zone.name}</div>
        </div>
        <button className="od-row-btn pr-detail-close" onClick={onClose} aria-label="Zavřít detail">
          <X size={15} />
        </button>
      </div>
      {alert && (
        <div className="pr-detail-alert">
          <AlertTriangle size={15} /> {alert}
        </div>
      )}

      <div className="pr-detail-sub">
        Poptávka – {DAY_LONG[d].toLowerCase()} · teď <b className="mono">{num2(profile[h])} / h</b>
      </div>
      <div className="pr-mini" role="group" aria-label="Poptávka na úseku po hodinách">
        {profile.map((v, hh) => (
          <button
            key={hh}
            className={"pr-mini-bar" + (hh === h ? " is-sel" : "")}
            onClick={() => onHour(hh)}
            aria-label={`${hourLabel(hh)}: ${num2(v)} událostí za hodinu`}
            title={`${hourLabel(hh)} · ${num2(v)} / h`}
          >
            <span style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: heatColor(v / max) }} />
          </button>
        ))}
      </div>
      <div className="pr-mini-ticks mono" aria-hidden="true">
        <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
      </div>

      <div className="pr-detail-sub">Dojezd v {hourLabel(h)} a šance dorazit první</div>
      <ul className="pr-reach">
        {rows.map(({ s, T, p }) => (
          <li key={s.id}>
            <span className="pr-rank-id">{s.id}</span>
            <span className="pr-reach-name">{s.name}</span>
            <span className="pr-reach-t mono">{minutes(T)}</span>
            <span className="pr-reach-p mono">{pct(p)}</span>
          </li>
        ))}
      </ul>

      <button className="od-modal-cancel pr-tool pr-detail-act" onClick={onAddJob}>
        <Plus size={15} /> Zapsat výjezd na tomto úseku
      </button>
    </div>
  );
}

type StandProps = {
  params: ModelParams;
  standId: string;
  d: number;
  h: number;
  onClose: () => void;
};

// Dosah stanoviště: na které úseky odsud dorazím včas. Mapa je v tomto režimu
// obarvená podle šance dorazit první (ne podle poptávky).
export function StandReach({ params, standId, d, h, onClose }: StandProps) {
  const idx = params.stands.findIndex((s) => s.id === standId);
  const stand = params.stands[idx];
  const ev = useMemo(() => evaluate(params, d, h), [params, d, h]);
  const reach = useMemo(() => (stand ? standReach(params, stand, d, h) : []), [params, stand, d, h]);
  if (!stand) return null;
  const rank = ev.scores.filter((s) => s > ev.scores[idx]).length + 1;

  return (
    <div className="pr-detail">
      <div className="pr-detail-head">
        <div>
          <div className="pr-detail-kicker">Dosah stanoviště {stand.id}</div>
          <div className="pr-detail-title">{stand.name}</div>
        </div>
        <button className="od-row-btn pr-detail-close" onClick={onClose} aria-label="Zavřít dosah">
          <X size={15} />
        </button>
      </div>
      <div className="pr-detail-sub">
        Nejbližší úseky · v {hourLabel(h)}: šance na zakázku <b className="mono">{pct(probAtLeastOne(ev.scores[idx]))}</b> ·{" "}
        {rank === 1 ? "nejlepší stanoviště" : `${rank}. z ${params.stands.length}`}
      </div>
      <ul className="pr-reach">
        {params.zones
          .map((z, i) => ({ z, r: reach[i] }))
          .sort((x, y) => x.r.minutes - y.r.minutes)
          .slice(0, REACH_ROWS)
          .map(({ z, r }) => (
            <li key={z.id}>
              <span className="pr-swatch" style={{ background: heatColor(r.capture) }} />
              <span className="pr-reach-name">{z.name}</span>
              <span className="pr-reach-t mono">{minutes(r.minutes)}</span>
              <span className="pr-reach-p mono">{pct(r.capture)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
