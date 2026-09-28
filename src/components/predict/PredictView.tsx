import { lazy, Suspense, useMemo, useState } from "react";
import type { JobLog, ModelParams } from "../../predict/types";
import { mondayIndex } from "../../predict/model";
import { weekDates, withCalendar } from "../../predict/calendar";
import { todayISO } from "../../utils/format";
import { NowTab, type JobPreset } from "./NowTab";
import type { AlertsState } from "./ShiftPlan";
import type { GeoState } from "../../hooks/useGeoPosition";
import type { ActiveJobState } from "../../hooks/useActiveJob";
import { RiskMap } from "./RiskMap";
import { JobsTab } from "./JobsTab";
import { StandsEditor } from "./StandsEditor";

// Historie nese data nehod po dnech (~100 kB) – načte se až při otevření.
const HistoryTab = lazy(() => import("./HistoryTab").then((m) => ({ default: m.HistoryTab })));

type Tab = "now" | "map" | "jobs" | "stands" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "now", label: "Teď" },
  { id: "map", label: "Týden" },
  { id: "jobs", label: "Výjezdy" },
  { id: "stands", label: "Stanoviště" },
  { id: "history", label: "Historie" },
];

type Props = {
  params: ModelParams;
  jobs: JobLog[];
  onAddJob: (preset?: JobPreset) => void;
  activeJob: ActiveJobState;
  alerts: AlertsState;
  geo: GeoState;
  onRequestDeleteJob: (job: JobLog) => void;
  onSaveParams: (next: ModelParams) => void;
};

const nowDH = (): [number, number] => {
  const t = new Date();
  return [mondayIndex(t), t.getHours()];
};

// Sekce „Kde čekat": doporučení stanoviště podle modelu poptávky × dojezdu.
export function PredictView({ params, jobs, onAddJob, activeJob, onRequestDeleteJob, onSaveParams, alerts, geo }: Props) {
  const [tab, setTab] = useState<Tab>("now");
  const [[d, h], setDH] = useState<[number, number]>(nowDH);
  const [nowD, nowH] = nowDH();
  // Teď a Týden počítají s konkrétními daty nejbližších 7 dnů (svátky, měsíc).
  // Úpravy (kalibrace, stanoviště) jdou dál nad původními params.
  const today = todayISO();
  const dates = useMemo(() => weekDates(new Date(today + "T00:00")), [today]);
  const week = useMemo(() => withCalendar(params, new Date(today + "T00:00")), [params, today]);

  return (
    <div className="od-fade">
      <div className="od-head pr-head">
        <h1>Kde čekat</h1>
        {params.isDemo && <span className="pr-demo">DEMO · modelová data</span>}
      </div>

      <div className="od-switch pr-tabs" role="tablist" aria-label="Kde čekat">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={"od-switch-btn" + (tab === t.id ? " is-active" : "")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "now" && (
        <NowTab
          params={week}
          dates={dates}
          d={d}
          h={h}
          onDay={(nd) => setDH([nd, h])}
          onHour={(nh) => setDH([d, nh])}
          onNow={() => setDH(nowDH())}
          isNow={d === nowD && h === nowH}
          jobs={jobs}
          onAddJob={onAddJob}
          activeJob={activeJob}
          alerts={alerts}
          geo={geo}
        />
      )}
      {tab === "map" && (
        <RiskMap
          params={week}
          dates={dates}
          nowD={nowD}
          nowH={nowH}
          onPick={(pd, ph) => {
            setDH([pd, ph]);
            setTab("now");
            window.scrollTo(0, 0);
          }}
        />
      )}
      {tab === "jobs" && (
        <JobsTab
          jobs={jobs}
          params={params}
          onAdd={() => onAddJob()}
          onRequestDelete={onRequestDeleteJob}
          onSaveParams={onSaveParams}
        />
      )}
      {tab === "stands" && <StandsEditor params={params} onSave={onSaveParams} />}
      {tab === "history" && (
        <Suspense fallback={<div className="pr-note">Načítám historii…</div>}>
          <HistoryTab params={params} jobs={jobs} />
        </Suspense>
      )}

      {!params.isDemo && params.dataSource && (
        <p className="pr-note pr-foot">
          Data: {params.dataSource}. Nehody evidované policií na úsecích sítě – drobné nehody bez policie a poruchy v
          datech nejsou.
        </p>
      )}
    </div>
  );
}
