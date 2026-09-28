import { useMemo, useRef, useState } from "react";
import type { DemandZone, GeoPoint, ModelParams, Stand } from "../../predict/types";
import { groupAmount, parseAmount } from "../../utils/format";
import { Check, ChevronDown, MapPin, Plus, Trash } from "../../icons";
import { estimateT0 } from "../../predict/geo";
import { ROAD_ORDER } from "../../predict/demoParams";
import { shortZoneName } from "../../predict/labels";
import { blindZones, suggestStands, type Suggestion } from "../../predict/suggest";
import { num1 } from "../../utils/format";
import { PragueMap, type MapStand, type MapZone } from "./PragueMap";
import { ConfirmModal } from "../ConfirmModal";

type Props = {
  params: ModelParams;
  onSave: (next: ModelParams) => void;
};

type Draft = { id: string; name: string; t0: Record<string, string>; schema?: Stand["schema"]; geo?: GeoPoint; estimated?: boolean };

const toDraft = (params: ModelParams): Draft[] =>
  params.stands.map((s) => ({
    id: s.id,
    name: s.name,
    schema: s.schema,
    geo: s.geo,
    t0: Object.fromEntries(params.zones.map((z) => [z.id, s.t0[z.id] == null ? "" : String(s.t0[z.id]).replace(".", ",")])),
  }));

// Další volné písmeno pro nové stanoviště (A, B, … Z, pak S1, S2…).
const nextId = (drafts: Draft[]): string => {
  const used = new Set(drafts.map((d) => d.id));
  for (let c = 65; c <= 90; c++) if (!used.has(String.fromCharCode(c))) return String.fromCharCode(c);
  let i = 1;
  while (used.has("S" + i)) i++;
  return "S" + i;
};

// Stanoviště = místo, kde můžete legálně a dlouhodobě stát a čekat na zakázku.
// Uložení vytvoří novou verzi parametrů (starší zůstanou zachované).
export function StandsEditor({ params, onSave }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>(() => toDraft(params));
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  // Nová verze parametrů zvenku (sync, kalibrace) → načíst znovu.
  const [seenVersion, setSeenVersion] = useState(params.version);
  if (params.version !== seenVersion) {
    setSeenVersion(params.version);
    setDrafts(toDraft(params));
  }

  // Stanoviště, kterému právě vybíráme polohu klepnutím do mapy.
  const [pickId, setPickId] = useState<string | null>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);

  // Návrhy nových míst a slepá místa počítáme z uložených parametrů.
  const suggestions = useMemo(() => suggestStands(params, 3), [params]);
  const blind = useMemo(() => new Set(blindZones(params)), [params]);
  const [added, setAdded] = useState<Set<number>>(() => new Set());
  // Seznam je sbalený; úprava jen u rozbaleného stanoviště.
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Draft | null>(null);
  const zoneName = (id: string) => params.zones.find((z) => z.id === id)?.name ?? id;

  const mapZones = useMemo<MapZone[]>(
    () =>
      params.zones.flatMap((z) =>
        z.geo
          ? [{
              id: z.id,
              path: z.geo.path,
              color: blind.has(z.id) ? "#e8624a" : "#7a4a26",
              tooltip: `<b>${z.name}</b>${blind.has(z.id) ? "<br>mimo dosah – v běžném provozu odnikud do " + Math.round(params.capture.tHalf) + " min" : ""}`,
            }]
          : [],
      ),
    [params.zones, params.capture.tHalf, blind],
  );
  const mapStands = useMemo<MapStand[]>(
    () => [
      ...drafts.flatMap((d) =>
        d.geo ? [{ id: d.id, pos: d.geo, active: d.id === pickId, tooltip: `<b>${d.id} · ${d.name || "bez názvu"}</b>` }] : [],
      ),
      ...suggestions.flatMap((sg, i) =>
        added.has(i)
          ? []
          : [{ id: String(i + 1), pos: sg.pos, suggest: true, tooltip: `<b>Návrh ${i + 1}</b><br>~${num1(sg.weekly)} zakázky za týden` }],
      ),
    ],
    [drafts, pickId, suggestions, added],
  );

  const addSuggestion = (sg: Suggestion, i: number) => {
    const zone = params.zones.find((z) => z.id === sg.zoneId);
    const id = nextId(drafts);
    setOpenId(id);
    setDrafts((ds) =>
      ds.concat([{
        id,
        name: `Návrh u ${zone ? zone.name : "sítě"}`,
        geo: sg.pos,
        t0: Object.fromEntries(Object.entries(sg.t0).map(([k, v]) => [k, String(v).replace(".", ",")])),
        estimated: true,
      }]),
    );
    setAdded((a) => new Set(a).add(i));
    setSaved(false);
  };

  const startPick = (id: string) => {
    setPickId((cur) => (cur === id ? null : id));
    mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  // Nová poloha → dojezdy na všechny úseky přepočítat odhadem (staré patří jinému místu).
  const onPick = (p: GeoPoint) => {
    if (!pickId) return;
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.id !== pickId) return d;
        const t0 = Object.fromEntries(
          params.zones.map((z) => {
            const est = z.geo ? estimateT0(p, z.geo.path) : null;
            return [z.id, est == null ? "" : String(est)];
          }),
        );
        return { ...d, geo: p, t0, estimated: true };
      }),
    );
    setPickId(null);
    setSaved(false);
  };

  const [openT0, setOpenT0] = useState<Set<string>>(() => new Set());
  const toggleOpen = (id: string) =>
    setOpenT0((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const roads = useMemo(() => {
    const m = new Map<string, DemandZone[]>();
    for (const z of params.zones) m.set(z.road ?? "Ostatní", [...(m.get(z.road ?? "Ostatní") ?? []), z]);
    const rank = (r: string) => ROAD_ORDER.indexOf(r) + 1 || 99;
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [params.zones]);
  const nearestLabel = (d: Draft): string => {
    let best: { name: string; t: number } | null = null;
    for (const z of params.zones) {
      const t = parseAmount(d.t0[z.id] ?? "");
      if (t != null && t > 0 && (!best || t < best.t)) best = { name: z.name, t };
    }
    return best ? `${best.name} ${Math.round(best.t)} min` : "–";
  };
  const picking = drafts.find((d) => d.id === pickId);

  const update = (i: number, patch: Partial<Draft>) => {
    setDrafts((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
    setErr("");
    setSaved(false);
  };

  const save = () => {
    const stands: Stand[] = [];
    for (const d of drafts) {
      const name = d.name.trim();
      if (!name) return setErr("Každé stanoviště musí mít název.");
      const t0: Record<string, number> = {};
      for (const z of params.zones) {
        const raw = (d.t0[z.id] ?? "").trim();
        if (raw === "") {
          // Prázdné pole = dopočítat z polohy (bez polohy je úsek nedosažitelný).
          const est = d.geo && z.geo ? estimateT0(d.geo, z.geo.path) : null;
          if (est != null) t0[z.id] = est;
          continue;
        }
        const v = parseAmount(raw);
        if (v === null || v <= 0) return setErr(`Dojezd „${name} → ${z.name}" musí být kladné číslo v minutách.`);
        t0[z.id] = v;
      }
      if (Object.keys(t0).length === 0) {
        return setErr(`Stanoviště „${name}" nemá polohu ani dojezdy – umístěte ho na mapě.`);
      }
      // Nové stanoviště umístíme do schématu k nejbližšímu úseku.
      let schema = d.schema;
      if (!schema) {
        const nearest = params.zones.reduce((a, z) => ((t0[z.id] ?? Infinity) < (t0[a.id] ?? Infinity) ? z : a));
        schema = nearest.schema ? { x: (nearest.schema.from + nearest.schema.to) / 2 } : undefined;
      }
      stands.push({ id: d.id, name, t0, schema, geo: d.geo });
    }
    if (stands.length === 0) return setErr("Přidejte aspoň jedno stanoviště.");
    onSave({
      ...params,
      version: params.version + 1,
      createdAt: new Date().toISOString(),
      source: "user",
      stands,
    });
    setSaved(true);
  };

  return (
    <section className="od-panel">
      <div className="od-panel-head">
        <div className="od-panel-title">Stanoviště</div>
      </div>
      <p className="pr-note pr-note-top">
        Místa, kde s vozem čekáte mezi zakázkami – parkoviště, benzínka, odstavná plocha u sjezdu. Musí jít stát
        legálně a dlouho a rychle najet na silnici. Umístěte je na mapě – dojezdy na všechny úseky se odhadnou z
        polohy. Kde odhad nesedí, přepište minuty ve volném provozu (včetně otočení na nejbližším sjezdu).
      </p>

      {suggestions.length > 0 && (
        <div className="pr-suggest">
          <div className="pr-zones-head">Návrh nových míst</div>
          <p className="pr-note pr-note-top">
            Místa podél sítě, odkud by se dalo nejvíc zakázek získat (odhad z polohy, dojezdy ověřte). Než místo
            přidáte, zkontrolujte, že se tam dá legálně a dlouho stát.
            {blind.size > 0 && <> Červeně jsou úseky, kam v běžném provozu nedojedete do {Math.round(params.capture.tHalf)} min z žádného stanoviště.</>}
          </p>
          <ol className="pr-suggest-list">
            {suggestions.map((sg, i) => (
              <li key={i}>
                <span className="pr-mpin is-suggest pr-suggest-n">{i + 1}</span>
                <span className="pr-suggest-main">
                  <span className="pr-suggest-name">u {zoneName(sg.zoneId)}</span>
                  <span className="pr-suggest-sub mono">
                    ~{num1(sg.weekly)} zakázky/týden
                    {sg.gainPerWeek > 0.05 ? ` · +${num1(sg.gainPerWeek)} k vašemu plánu` : " · vaše stanoviště jsou zatím lepší"}
                  </span>
                </span>
                <button className="od-modal-cancel pr-tool" disabled={added.has(i)} onClick={() => addSuggestion(sg, i)}>
                  {added.has(i) ? <><Check size={15} /> Přidáno</> : <><Plus size={15} /> Přidat</>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="pr-stands-map" ref={mapBoxRef}>
        <PragueMap zones={mapZones} stands={mapStands} picking={!!picking} onPick={onPick} />
        {picking && (
          <div className="pr-pick-hint">
            <MapPin size={16} /> Klepněte do mapy, kde stanoviště {picking.id}
            {picking.name ? ` (${picking.name})` : ""} je.
            <button className="pr-pick-cancel" onClick={() => setPickId(null)}>Zrušit</button>
          </div>
        )}
      </div>

      <div className="pr-stands">
        {drafts.map((d, i) =>
          openId !== d.id && pickId !== d.id ? (
            <button className="pr-stand-row" key={d.id} onClick={() => setOpenId(d.id)} aria-expanded={false}>
              <span className="pr-rank-id">{d.id}</span>
              <span className="pr-stand-row-main">
                <span className="pr-stand-row-name">{d.name || "Bez názvu"}</span>
                <span className="pr-stand-row-sub">
                  {d.geo ? `nejblíž ${nearestLabel(d)}` : "bez polohy – umístěte na mapě"}
                  {d.estimated && " · dojezdy odhadem"}
                </span>
              </span>
              <ChevronDown size={17} className="pr-stand-row-chev" />
            </button>
          ) : (
          <div className="pr-stand is-open" key={d.id}>
            <div className="pr-stand-head">
              <span className="pr-rank-id">{d.id}</span>
              <div className="od-field grow">
                <label>Název</label>
                <input
                  type="text"
                  className="pr-name-input"
                  value={d.name}
                  placeholder="např. Benzina Chodov"
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </div>
            </div>
            {d.estimated && (
              <div className="pr-stand-est">Dojezdy jsou přepočítané odhadem z nové polohy – zkontrolujte ty nejbližší.</div>
            )}
            <button
              className="pr-more pr-stand-t0-toggle"
              onClick={() => toggleOpen(d.id)}
              aria-expanded={openT0.has(d.id)}
            >
              <ChevronDown size={16} className={openT0.has(d.id) ? "is-open" : ""} />
              Dojezdy na úseky ({params.zones.length}) · nejblíž {nearestLabel(d)}
            </button>
            {openT0.has(d.id) &&
              roads.map(([road, zs]) => (
                <div key={road} className="pr-stand-road">
                  <div className="pr-zones-road">{road}</div>
                  <div className="pr-stand-t0">
                    {zs.map((z) => (
                      <div className="od-field" key={z.id}>
                        <label title={z.name}>{shortZoneName(z)}</label>
                        <div className="od-input-wrap">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="auto"
                            value={d.t0[z.id] ?? ""}
                            onChange={(e) => update(i, { t0: { ...d.t0, [z.id]: groupAmount(e.target.value) } })}
                          />
                          <span className="od-input-suffix">min</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            <button
              className={"pr-stand-geo" + (pickId === d.id ? " is-active" : "")}
              onClick={() => startPick(d.id)}
            >
              <MapPin size={15} />
              {pickId === d.id
                ? "Vyberte místo v mapě…"
                : d.geo
                  ? `Poloha ${d.geo.lat.toFixed(4)}, ${d.geo.lng.toFixed(4)} · změnit`
                  : "Umístit na mapě"}
            </button>
            <div className="pr-stand-foot">
              <button className="od-modal-cancel pr-tool pr-stand-del" onClick={() => setConfirmDel(d)}>
                <Trash size={15} /> Odebrat
              </button>
              <button className="od-modal-cancel pr-tool" onClick={() => setOpenId(null)}>
                <ChevronDown size={15} className="is-open" /> Sbalit
              </button>
            </div>
          </div>
          ),
        )}
      </div>

      <ConfirmModal
        entry={confirmDel ? { date: "", amount: 0 } : null}
        noun="stanoviště"
        detail={confirmDel ? `${confirmDel.id} · ${confirmDel.name || "bez názvu"}` : undefined}
        onConfirm={() => {
          if (confirmDel) {
            setDrafts((ds) => ds.filter((x) => x.id !== confirmDel.id));
            setSaved(false);
            setOpenId(null);
          }
          setConfirmDel(null);
        }}
        onCancel={() => setConfirmDel(null)}
      />

      {err && (
        <div className="od-err-box">
          <span className="od-err-ico" aria-hidden="true">!</span>
          {err}
        </div>
      )}

      <div className="pr-stands-acts">
        <button
          className="od-modal-cancel pr-tool"
          onClick={() => {
            const id = nextId(drafts);
            setDrafts((ds) => ds.concat([{ id, name: "", t0: {} }]));
            setOpenId(id);
            setSaved(false);
          }}
        >
          <Plus size={15} /> Přidat stanoviště
        </button>
        <button className="od-add" onClick={save}>
          <Check size={16} /> {saved ? "Uloženo" : "Uložit"}
        </button>
      </div>
    </section>
  );
}
