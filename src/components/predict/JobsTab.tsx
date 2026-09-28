import { useMemo, useState } from "react";
import type { JobLog, ModelParams } from "../../predict/types";
import { CALIBRATION_TARGET, calibrate, withCalibration, withZoneLearning, zoneLearning } from "../../predict/calibrate";
import { jobsToCSV, jobsToJSON } from "../../predict/exportJobs";
import { KIND_LABEL, PARAMS_SOURCE_LABEL, RESULT_LABEL, SOURCE_LABEL } from "../../predict/labels";
import { dateLabel, num1, plural, todayISO } from "../../utils/format";
import { ChevronDown, Download, Plus, Target, Trash, Truck } from "../../icons";
import { Kpi } from "../Kpi";
import { pct } from "./heat";

type Props = {
  jobs: JobLog[];
  params: ModelParams;
  onAdd: () => void;
  onRequestDelete: (job: JobLog) => void;
  onSaveParams: (next: ModelParams) => void;
};

const RECENT = 30;

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const timeOf = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dateOf = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function JobsTab({ jobs, params, onAdd, onRequestDelete, onSaveParams }: Props) {
  const result = useMemo(() => calibrate(jobs), [jobs]);
  const sorted = useMemo(() => jobs.slice().sort((a, b) => (a.calledAt < b.calledAt ? 1 : -1)), [jobs]);
  const won = jobs.filter((j) => j.result === "won").length;
  const progress = Math.min(1, jobs.length / CALIBRATION_TARGET);
  const zoneName = (id: string) => params.zones.find((z) => z.id === id)?.name ?? id;
  const standName = (id: string) => params.stands.find((s) => s.id === id)?.name ?? id;

  // Učení poptávky po úsecích: kde chodí víc / méně zakázek, než model čeká.
  const learning = useMemo(() => zoneLearning(params, jobs), [params, jobs]);
  const learnApplied =
    learning.ok && learning.zones.every((z) => Math.abs((params.zones.find((x) => x.id === z.zoneId)?.learn ?? 1) - z.factor) < 1e-6);
  const learnTop = learning.ok
    ? learning.zones
        .filter((z) => Math.abs(Math.log(z.factor)) > 0.05)
        .sort((a, b) => Math.abs(Math.log(b.factor)) - Math.abs(Math.log(a.factor)))
        .slice(0, 6)
    : [];

  const [showModel, setShowModel] = useState(false);

  const calibrated =
    result.ok &&
    Math.abs(result.tHalf - params.capture.tHalf) < 1e-6 &&
    Math.abs(result.k - params.capture.k) < 1e-6;

  // Bez výjezdů: jen hlavní akce a proč se to vyplatí (statistiky by byly prázdné).
  if (jobs.length === 0) {
    return (
      <section className="od-panel pr-jobs-empty">
        <div className="od-empty">
          <div className="od-empty-ico"><Truck size={26} /></div>
          <div className="od-empty-title">Zapisujte výjezdy, model se zpřesní</div>
          <div className="od-empty-sub">
            U každé zakázky stačí zapsat, odkud jste vyjeli, jak dlouho jste jeli a jestli jste ji získali. Od 20
            výjezdů appka pozná, na kterých úsecích vám zakázky opravdu chodí, od 30 spočítá, jak rychle musíte být
            na místě.
          </div>
          <button className="od-add pr-jobs-empty-add" onClick={onAdd}>
            <Plus size={16} /> Zapsat první výjezd
          </button>
          <div className="pr-note">Rychleji: na mapě v záložce Teď podržte prst na úseku, kde zakázka byla.</div>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="od-kpis">
        <Kpi
          label="Zapsané výjezdy"
          value={String(jobs.length)}
          unit={`/ ${CALIBRATION_TARGET}`}
          icon={<Truck size={18} />}
          foot={
            jobs.length >= CALIBRATION_TARGET
              ? "dost dat pro spolehlivou kalibraci"
              : `do spolehlivé kalibrace chybí ${CALIBRATION_TARGET - jobs.length}`
          }
        />
        <Kpi
          label="Získané zakázky"
          value={jobs.length ? pct(won / jobs.length) : "–"}
          icon={<Target size={18} />}
          foot={`${won} ${plural(won, "získaná", "získané", "získaných")} z ${jobs.length}`}
        />
      </div>

      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Výjezdy</div>
          <div className="od-panel-tools">
            {jobs.length > 0 && (
              <>
                <button className="od-modal-cancel pr-tool" onClick={() => download(`vyjezdy-${todayISO()}.csv`, "text/csv", jobsToCSV(jobs))}>
                  <Download size={15} /> CSV
                </button>
                <button className="od-modal-cancel pr-tool" onClick={() => download(`vyjezdy-${todayISO()}.json`, "application/json", jobsToJSON(jobs))}>
                  <Download size={15} /> JSON
                </button>
              </>
            )}
            <button className="od-add" onClick={onAdd}>
              <Plus size={16} /> Zapsat výjezd
            </button>
          </div>
        </div>
        {sorted.length === 0 ? (
          <div className="od-empty">
            <div className="od-empty-ico"><Truck size={26} /></div>
            <div className="od-empty-title">Zatím žádný výjezd</div>
            <div className="od-empty-sub">
              U každé zakázky zapište, odkud jste vyjeli, jak dlouho jste jeli a jestli jste ji získali. Z toho se model naučí, jak rychle musíte být na místě.
            </div>
          </div>
        ) : (
          <div className="od-table-wrap">
            <table className="od-table">
              <thead>
                <tr>
                  <th>Kdy</th>
                  <th>Úsek</th>
                  <th>Odkud</th>
                  <th className="r">Dojezd</th>
                  <th>Typ</th>
                  <th>Výsledek</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, RECENT).map((j) => (
                  <tr key={j.id}>
                    <td className="mono">{dateLabel(dateOf(j.calledAt))} {timeOf(j.calledAt)}</td>
                    <td>{zoneName(j.segmentId)}</td>
                    <td>{standName(j.standId)}</td>
                    <td className="r mono">{num1(j.travelMinutes)} min</td>
                    <td>{KIND_LABEL[j.kind]}</td>
                    <td className={j.result === "won" ? "profit" : "faint"}>{RESULT_LABEL[j.result]}</td>
                    <td className="r">
                      <button className="od-row-btn" onClick={() => onRequestDelete(j)} title="Smazat" aria-label="Smazat výjezd">
                        <Trash size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length > RECENT && (
              <div className="pr-note">Zobrazeno {RECENT} nejnovějších, všechny jsou v exportu.</div>
            )}
          </div>
        )}
      </section>
      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Kalibrace</div>
        </div>
        <div className="pr-bar pr-bar-lg" aria-label={`Postup ${Math.round(progress * 100)} %`}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        {result.ok ? (
          <div className="pr-calib">
            <p>
              Z {result.n} výjezdů vychází 50% šance při dojezdu <b className="mono">{num1(result.tHalf)} min</b>{" "}
              (k = <span className="mono">{num1(result.k)}</span>). Poruchy tvoří{" "}
              <span className="mono">{pct(result.breakdownShare)}</span> výjezdů.
              {result.preliminary && " Výsledek je zatím orientační."}
            </p>
            {Object.keys(result.bySource).length > 1 && (
              <ul className="pr-sources">
                {Object.entries(result.bySource).map(([src, s]) => (
                  <li key={src}>
                    <span>{SOURCE_LABEL[src as keyof typeof SOURCE_LABEL]}</span>
                    <span className="mono">{s.n}× · získáno {pct(s.wonRate)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="od-add"
              disabled={calibrated}
              onClick={() => onSaveParams(withCalibration(params, result))}
            >
              <Target size={16} /> {calibrated ? "Křivka je aktuální" : "Použít kalibraci"}
            </button>
          </div>
        ) : (
          <p className="pr-note">
            {result.reason} Spolehlivá kalibrace je od {CALIBRATION_TARGET} výjezdů.
          </p>
        )}
        <p className="pr-note">
          Teď model počítá s 50% šancí, když na místo dojedete do <b className="mono">{num1(params.capture.tHalf)} min</b>.
        </p>
      </section>

      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Poptávka po úsecích</div>
        </div>
        {learning.ok ? (
          <div className="pr-calib">
            <p>
              Z {learning.n} výjezdů: úseky, kde chodí víc (↑) nebo méně (↓) zakázek, než model čekal. Úseky s málo
              výjezdy se mění jen mírně.
            </p>
            {learnTop.length > 0 ? (
              <ul className="pr-sources">
                {learnTop.map((z) => (
                  <li key={z.zoneId}>
                    <span>{zoneName(z.zoneId)}</span>
                    <span className="mono">
                      {z.observed}× / čekáno {num1(z.expected)} · {z.factor >= 1 ? "↑" : "↓"} ×{num1(z.factor)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Výjezdy zatím odpovídají modelu.</p>
            )}
            <button className="od-add" disabled={learnApplied} onClick={() => onSaveParams(withZoneLearning(params, learning))}>
              <Target size={16} /> {learnApplied ? "Poptávka je aktuální" : "Upravit poptávku úseků"}
            </button>
          </div>
        ) : (
          <p className="pr-note">{learning.reason} Pak se model naučí, na kterých úsecích vám zakázky opravdu chodí.</p>
        )}
      </section>

      <section className="od-panel">
        <button className="pr-more pr-model-toggle" onClick={() => setShowModel((v) => !v)} aria-expanded={showModel}>
          <ChevronDown size={16} className={showModel ? "is-open" : ""} /> Podrobnosti modelu
        </button>
        {showModel && (
          <ul className="pr-sources pr-model">
            <li><span>Křivka p(T): 50% šance při dojezdu</span><span className="mono">{num1(params.capture.tHalf)} min</span></li>
            <li><span>Strmost křivky k</span><span className="mono">{num1(params.capture.k)}</span></li>
            <li><span>Verze parametrů</span><span className="mono">v{params.version} · {PARAMS_SOURCE_LABEL[params.source]}</span></li>
            <li><span>Kalibrace orientačně / spolehlivě</span><span className="mono">od 30 / {CALIBRATION_TARGET} výjezdů</span></li>
          </ul>
        )}
      </section>
    </>
  );
}
