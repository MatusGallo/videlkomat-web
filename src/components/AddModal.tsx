import { useEffect, useRef, useState } from "react";
import { PROFIT_RATE, PROFIT_PCT, FUEL_COST_RATE, FUEL_COST_PCT } from "../constants";
import { czk, groupAmount, isISODate, isoOf, num1, parseAmount, todayISO } from "../utils/format";
import { periodOf } from "../utils/stats";
import { Plus, X, Check } from "../icons";
import { DateField } from "./DateField";
import { useSheetDrag } from "../hooks/useSheetDrag";
import { Dropdown } from "./Dropdown";
import type { GeoPoint, JobDirection, JobKind, JobLog, JobResult, JobSource, ModelParams } from "../predict/types";
import { evaluate, mondayIndex } from "../predict/model";
import { distanceKm } from "../predict/geo";
import { DIRECTION_LABEL, KIND_LABEL, RESULT_LABEL, SOURCES, SOURCE_LABEL } from "../predict/labels";
import type { JobPreset } from "./predict/NowTab";

export type AddMode = "entry" | "fuel" | "job";
type Mode = AddMode;

// Výjezd bez id – id (a případný navázaný zásah) doplní App.
export type NewJob = Omit<JobLog, "id" | "entryId">;

type Props = {
  open: boolean;
  initialMode: Mode;
  onClose: () => void;
  onAddEntry: (m: number, date: string, amount: number) => void;
  onAddFuel: (m: number, date: string, amount: number, liters: number | null) => void;
  // Získaný výjezd s částkou se zapíše zároveň jako Zásah.
  onAddJob: (job: NewJob, entry: { m: number; date: string; amount: number } | null) => void;
  params: ModelParams;
  // Předvyplnění z mapy (klepnutí / podržení na úseku) nebo z rozjetého výjezdu.
  jobPreset?: JobPreset;
  // Moje poloha (GPS) – předvyplní nejbližší stanoviště.
  myPos?: GeoPoint | null;
};

const nowHHMM = (): string => {
  const t = new Date();
  return String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
};
const parseHHMM = (s: string): [number, number] | null => {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = +m[1], min = +m[2];
  return h < 24 && min < 60 ? [h, min] : null;
};
// Výchozí stanoviště: nejbližší k mé poloze (do 1,5 km), jinak doporučené pro
// aktuální hodinu (odkud nejspíš vyjíždíte).
const defaultStand = (params: ModelParams, pos?: GeoPoint | null): number => {
  if (pos) {
    let bi = -1, bd = 1.5;
    params.stands.forEach((s, i) => {
      if (!s.geo) return;
      const d = distanceKm(pos, s.geo);
      if (d < bd) { bd = d; bi = i; }
    });
    if (bi >= 0) return bi;
  }
  const t = new Date();
  return Math.max(0, evaluate(params, mondayIndex(t), t.getHours()).best);
};

type Choice<T extends string> = { value: T; label: string };
function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: Choice<T>[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="od-switch od-switch-add pr-seg-field" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={"od-switch-btn" + (value === o.value ? " is-active" : "")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Na dotykovém zařízení nechceme autofocus – vysunul by klávesnici hned při
// otevření sheetu a překryl formulář. Na desktopu (zkratky N/T) focus chceme.
const isTouch = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;

// Jeden „Přidat" sheet s přepínačem Zásah / Tankování.
export function AddModal({ open, initialMode, onClose, onAddEntry, onAddFuel, onAddJob, params, jobPreset, myPos }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [time, setTime] = useState(nowHHMM);
  const [zoneIdx, setZoneIdx] = useState(0);
  const [standIdx, setStandIdx] = useState(0);
  const [direction, setDirection] = useState<JobDirection | "none">("none");
  const [travel, setTravel] = useState("");
  const [kind, setKind] = useState<JobKind>("accident");
  const [result, setResult] = useState<JobResult>("won");
  const [source, setSource] = useState<JobSource>("assistance");
  const [jobGeo, setJobGeo] = useState<GeoPoint | null>(null);
  const [err, setErr] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<number | null>(null);
  const sheet = useSheetDrag(onClose, open);

  // Reset formuláře při otevření (nebo přepnutí režimu zkratkou, když je sheet otevřený).
  // Děje se během renderu, ne v efektu – jinak by se sheet vykreslil dvakrát.
  const openKey = open ? initialMode : null;
  const [prevOpenKey, setPrevOpenKey] = useState<Mode | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey) {
      setMode(openKey);
      setDate(todayISO());
      setAmount("");
      setLiters("");
      setErr("");
      setJustAdded(null);
      setTime(nowHHMM());
      setTravel("");
      setResult("won");
      setStandIdx(defaultStand(params, myPos));
      const zi = jobPreset?.zoneId ? params.zones.findIndex((z) => z.id === jobPreset.zoneId) : -1;
      if (zi >= 0) setZoneIdx(zi);
      setJobGeo(jobPreset?.geo ?? null);
      // Rozjetý výjezd: stanoviště, změřený dojezd, výsledek a čas vyjetí.
      const si = jobPreset?.standId ? params.stands.findIndex((s) => s.id === jobPreset.standId) : -1;
      if (si >= 0) setStandIdx(si);
      if (jobPreset?.travelMinutes != null) setTravel(num1(jobPreset.travelMinutes));
      if (jobPreset?.result) setResult(jobPreset.result);
      if (jobPreset?.calledAt) {
        const t = new Date(jobPreset.calledAt);
        if (!isNaN(t.getTime())) {
          setDate(isoOf(t));
          setTime(String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0"));
        }
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    if (!isTouch()) requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, [open, initialMode]);

  // Scroll pod sheetem držíme zamknutý, dokud je sheet v DOMu – tedy i po dobu
  // odchodové animace, jinak by se stránka vzadu na chvilku rozjela.
  useEffect(() => {
    if (!sheet.mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet.mounted]);

  // Po zavření zůstane sheet ještě chvíli v DOMu, aby stihl odejít.
  if (!sheet.mounted) return null;
  const isFuel = mode === "fuel";
  const isJob = mode === "job";
  const previewAmount = parseAmount(amount);
  const previewLiters = parseAmount(liters);
  const perLiter =
    previewAmount && previewLiters && previewLiters > 0 ? previewAmount / previewLiters : null;

  const switchMode = (m: Mode) => {
    setMode(m);
    setErr("");
    if (!isTouch()) requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submitJob = () => {
    const hm = parseHHMM(time);
    if (!isISODate(date)) return setErr("Neplatné datum.");
    if (!hm) return setErr("Zadejte čas ve tvaru 14:30.");
    const t = parseAmount(travel);
    if (t === null || t <= 0) return setErr("Zadejte dojezd v minutách, větší než 0.");
    const zone = params.zones[zoneIdx];
    const stand = params.stands[standIdx];
    if (!zone || !stand) return setErr("Vyberte úsek a stanoviště.");
    const a = parseAmount(amount);
    const withEntry = result === "won" && amount.trim() !== "";
    if (withEntry && (a === null || a <= 0)) return setErr("Částka musí být větší než 0, nebo nechte pole prázdné.");

    const calledAt = new Date(`${date}T${String(hm[0]).padStart(2, "0")}:${String(hm[1]).padStart(2, "0")}:00`).toISOString();
    onAddJob(
      {
        calledAt,
        segmentId: zone.id,
        direction: direction === "none" ? null : direction,
        standId: stand.id,
        travelMinutes: t,
        kind,
        result,
        source,
        lat: jobGeo?.lat ?? null,
        lng: jobGeo?.lng ?? null,
      },
      withEntry ? { m: periodOf(date).m, date, amount: a as number } : null,
    );

    if (keepOpen) {
      setJustAdded(`výjezd (${RESULT_LABEL[result].toLowerCase()})`);
      setTravel("");
      setAmount("");
      setErr("");
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setJustAdded(null), 1800);
    } else {
      onClose();
    }
  };

  const submit = () => {
    if (isJob) return submitJob();
    const v = parseAmount(amount);
    if (v === null || v <= 0) {
      setErr(isFuel ? "Zadej natankovanou sumu větší než 0." : "Zadej částku větší než 0.");
      return;
    }
    if (!isISODate(date)) {
      setErr("Neplatné datum.");
      return;
    }
    const l = parseAmount(liters);
    if (isFuel && liters.trim() !== "" && (l === null || l <= 0)) {
      setErr("Litry musí být kladné číslo, nebo nech pole prázdné.");
      return;
    }
    const m = periodOf(date).m;
    if (isFuel) onAddFuel(m, date, v, liters.trim() === "" ? null : l);
    else onAddEntry(m, date, v);

    if (keepOpen) {
      setJustAdded(czk(v));
      setAmount("");
      setLiters("");
      setErr("");
      requestAnimationFrame(() => inputRef.current?.focus());
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setJustAdded(null), 1800);
    } else {
      onClose();
    }
  };

  return (
    <div className={sheet.wrapClass} onClick={onClose}>
      <div
        className={"od-modal od-modal-wide" + (isJob ? " is-job" : "")}
        onClick={(e) => e.stopPropagation()}
        style={sheet.style}
        {...sheet.handlers}
      >
        <div className="od-modal-head">
          <h3>Přidat</h3>
          <button className="od-row-btn" onClick={onClose} title="Zavřít">
            <X size={15} />
          </button>
        </div>

        <div className="od-switch od-switch-add" role="tablist" aria-label="Typ záznamu">
          <button
            role="tab"
            aria-selected={mode === "entry"}
            className={"od-switch-btn" + (mode === "entry" ? " is-active" : "")}
            onClick={() => switchMode("entry")}
          >
            Zásah
          </button>
          <button
            role="tab"
            aria-selected={isFuel}
            className={"od-switch-btn" + (isFuel ? " is-active" : "")}
            onClick={() => switchMode("fuel")}
          >
            Tankování
          </button>
          <button
            role="tab"
            aria-selected={isJob}
            className={"od-switch-btn" + (isJob ? " is-active" : "")}
            onClick={() => switchMode("job")}
          >
            Výjezd
          </button>
        </div>

        <p className="od-modal-sub">
          {isJob
            ? "Výjezdy zpřesňují doporučení stanovišť. Získaná zakázka s částkou se zapíše i jako zásah."
            : isFuel
              ? "Datum určuje měsíc i rok záznamu. Litry jsou nepovinné."
              : "Datum určuje měsíc i rok záznamu."}
        </p>

        <div className="od-form od-form-stack">
          {isJob ? (
            <div className="pr-form-row">
              <div className="od-field">
                <label>Datum</label>
                <DateField value={date} onChange={setDate} />
              </div>
              <div className="od-field pr-time">
                <label>Čas volání</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="14:30"
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value.replace(/[^0-9:.]/g, "").slice(0, 5));
                    if (err) setErr("");
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="od-field">
              <label>Datum</label>
              <DateField value={date} onChange={setDate} />
            </div>
          )}

          {isJob && (
            <>
              <div className="od-field">
                <label>Úsek</label>
                <Dropdown
                  value={zoneIdx}
                  options={params.zones.map((z, i) => ({ value: i, label: z.name }))}
                  onChange={setZoneIdx}
                  ariaLabel="Úsek"
                />
                {jobGeo && (
                  <span className="pr-job-geo">
                    Místo zakázky {jobGeo.lat.toFixed(4)}, {jobGeo.lng.toFixed(4)}
                    <button type="button" onClick={() => setJobGeo(null)}>Odebrat</button>
                  </span>
                )}
              </div>
              <div className="od-field">
                <label>Směr</label>
                <Segmented
                  label="Směr"
                  value={direction}
                  onChange={setDirection}
                  options={[
                    { value: "to_center", label: DIRECTION_LABEL.to_center },
                    { value: "from_center", label: DIRECTION_LABEL.from_center },
                    { value: "none", label: "Neuvedeno" },
                  ]}
                />
              </div>
              <div className="od-field">
                <label>Odkud jste vyjeli</label>
                <Dropdown
                  value={standIdx}
                  options={params.stands.map((s, i) => ({ value: i, label: `${s.id} · ${s.name}` }))}
                  onChange={setStandIdx}
                  ariaLabel="Stanoviště"
                />
              </div>
              <div className="od-field">
                <label>Dojezd na místo</label>
                <div className="od-input-wrap">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="např. 9"
                    value={travel}
                    aria-invalid={!!err}
                    onChange={(e) => {
                      setTravel(groupAmount(e.target.value));
                      if (err) setErr("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                  />
                  <span className="od-input-suffix">min</span>
                </div>
              </div>
              <div className="od-field">
                <label>Typ</label>
                <Segmented
                  label="Typ"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "accident", label: KIND_LABEL.accident },
                    { value: "breakdown", label: KIND_LABEL.breakdown },
                  ]}
                />
              </div>
              <div className="od-field">
                <label>Výsledek</label>
                <Segmented
                  label="Výsledek"
                  value={result}
                  onChange={setResult}
                  options={[
                    { value: "won", label: RESULT_LABEL.won },
                    { value: "lost", label: RESULT_LABEL.lost },
                  ]}
                />
              </div>
              <div className="od-field">
                <label>Zdroj zakázky</label>
                <Dropdown
                  value={SOURCES.indexOf(source)}
                  options={SOURCES.map((s, i) => ({ value: i, label: SOURCE_LABEL[s] }))}
                  onChange={(i) => setSource(SOURCES[i])}
                  ariaLabel="Zdroj zakázky"
                />
              </div>
            </>
          )}

          {(!isJob || result === "won") && (
          <div className="od-field">
            <label>
              {isFuel ? "Natankováno" : isJob ? "Částka zásahu" : "Částka"}
              {isJob && <span className="od-label-opt"> (nepovinné – zapíše i zásah)</span>}
            </label>
            <div className="od-input-wrap">
              <input
                ref={isJob ? undefined : inputRef}
                type="text"
                inputMode="decimal"
                placeholder={isFuel ? "např. 2 000" : "např. 3 500"}
                value={amount}
                aria-invalid={!!err}
                onChange={(e) => {
                  setAmount(groupAmount(e.target.value));
                  if (err) setErr("");
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <span className="od-input-suffix">Kč</span>
            </div>
          </div>
          )}

          {isFuel && (
            <div className="od-field">
              <label>Litry <span className="od-label-opt">(nepovinné)</span></label>
              <div className="od-input-wrap">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="např. 35,4"
                  value={liters}
                  onChange={(e) => {
                    setLiters(groupAmount(e.target.value));
                    if (err) setErr("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <span className="od-input-suffix">L</span>
              </div>
            </div>
          )}

          {err && (
            <div className="od-err-box">
              <span className="od-err-ico" aria-hidden="true">!</span>
              {err}
            </div>
          )}

          {isJob ? null : isFuel ? (
            <>
              <div className="od-profit-readout">
                <span className="od-profit-label">Můj náklad {FUEL_COST_PCT} %</span>
                <span className="od-profit-val mono">
                  {previewAmount ? czk(previewAmount * FUEL_COST_RATE) : "–"}
                </span>
              </div>
              <div className="od-profit-readout">
                <span className="od-profit-label">Cena za litr</span>
                <span className="od-profit-val mono">{perLiter ? `${num1(perLiter)} Kč/L` : "–"}</span>
              </div>
            </>
          ) : (
            <div className="od-profit-readout">
              <span className="od-profit-label">Zisk {PROFIT_PCT} %</span>
              <span className="od-profit-val mono">
                {previewAmount ? czk(previewAmount * PROFIT_RATE) : "–"}
              </span>
            </div>
          )}

          <label className="od-check">
            <input
              type="checkbox"
              checked={keepOpen}
              onChange={(e) => setKeepOpen(e.target.checked)}
            />
            <span className="od-check-box" aria-hidden="true">
              {keepOpen && <Check size={13} />}
            </span>
            <span>Po přidání nezavírat (přidat více záznamů)</span>
          </label>
          {justAdded && (
            <div className="od-add-flash">
              <Check size={15} /> Přidáno {justAdded}
            </div>
          )}
        </div>

        <div className="od-modal-acts">
          <button className="od-modal-cancel" onClick={onClose}>
            {keepOpen ? "Hotovo" : "Zrušit"}
          </button>
          <button className="od-add" onClick={submit}>
            <Plus size={16} /> Přidat
          </button>
        </div>
      </div>
    </div>
  );
}
