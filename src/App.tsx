import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Entry, Fuel, View } from "./types";
import type { JobLog, ModelParams } from "./predict/types";
import { loadEntries, saveEntries, loadFuels, saveFuels, loadJobs, saveJobs, loadParamRows, saveParamRows } from "./utils/storage";
import { entriesApi, fuelApi, jobsApi, paramsApi, type ParamsRow, type Resource } from "./utils/api";
import { latestParams } from "./predict/labels";
import { withCalendar } from "./predict/calendar";
import { activeMonthsOf, availableYears, computeStats, periodOf } from "./utils/stats";
import { CURRENT_MONTH, CURRENT_YEAR } from "./constants";
import { isISODate, todayISO, uid } from "./utils/format";
import { useSettings } from "./utils/settings";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { MonthView } from "./components/MonthView";
import { FuelView } from "./components/FuelView";
import { ConfirmModal } from "./components/ConfirmModal";
import { AddModal, type AddMode, type NewJob } from "./components/AddModal";
// Kde čekat (mapa, Leaflet) se načte až při otevření sekce – menší start appky.
const PredictView = lazy(() => import("./components/predict/PredictView").then((m) => ({ default: m.PredictView })));
import type { JobPreset } from "./components/predict/NowTab";
import { useShiftAlerts } from "./hooks/useShiftAlerts";
import { useGeoPosition } from "./hooks/useGeoPosition";
import { useActiveJob } from "./hooks/useActiveJob";
import { TabBar } from "./components/TabBar";
import { MenuView } from "./components/MenuView";
import { MobileTitleBar } from "./components/MobileTitleBar";
import { Logo, Menu } from "./icons";

// Při startu sesynchronizuj s serverem. Lokální záznamy, které na serveru
// chybí (první migrace z localStorage nebo offline úpravy), nahraj nahoru;
// u konfliktů podle id vítězí server. Offline → ponecháme lokální cache.
function syncWithServer<T extends { id: string }>(
  api: Resource<T>,
  local: () => T[],
  apply: (next: T[]) => void,
) {
  api
    .list()
    .then(async (server) => {
      const serverIds = new Set(server.map((x) => x.id));
      const localOnly = local().filter((x) => !serverIds.has(x.id));
      await Promise.all(localOnly.map((x) => api.upsert(x).catch(() => {})));
      apply(server.concat(localOnly));
    })
    .catch(() => {
      /* offline / chyba serveru: pokračujeme s lokální cache */
    });
}

export default function App() {
  const { settings, setSelectedYear } = useSettings();
  const [entries, setEntries] = useState<Entry[]>(loadEntries);
  const [fuels, setFuels] = useState<Fuel[]>(loadFuels);
  const [rawView, setView] = useState<View>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [pendingDeleteFuel, setPendingDeleteFuel] = useState<Fuel | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [jobs, setJobs] = useState<JobLog[]>(loadJobs);
  const [paramRows, setParamRows] = useState<ParamsRow[]>(loadParamRows);
  const [pendingDeleteJob, setPendingDeleteJob] = useState<JobLog | null>(null);
  const params = useMemo(() => latestParams(paramRows), [paramRows]);
  const [addMode, setAddMode] = useState<AddMode>("entry");
  const [jobPreset, setJobPreset] = useState<JobPreset | undefined>(undefined);
  // Upozornění počítají se svátky a měsícem nejbližších dnů.
  const today = todayISO();
  const weekParams = useMemo(() => withCalendar(params, new Date(today + "T00:00")), [params, today]);
  const alerts = useShiftAlerts(weekParams);
  const geo = useGeoPosition();
  const openAdd = (mode: AddMode, preset?: JobPreset) => {
    setAddMode(mode);
    setJobPreset(preset);
    setAddOpen(true);
  };

  // Aktualizuj UI + lokální cache okamžitě (optimistic update).
  const cache = (next: Entry[]) => {
    setEntries(next);
    saveEntries(next);
  };
  const cacheFuels = (next: Fuel[]) => {
    setFuels(next);
    saveFuels(next);
  };
  const cacheJobs = (next: JobLog[]) => {
    setJobs(next);
    saveJobs(next);
  };
  const cacheParamRows = (next: ParamsRow[]) => {
    setParamRows(next);
    saveParamRows(next);
  };

  useEffect(() => {
    syncWithServer(entriesApi, loadEntries, cache);
    syncWithServer(fuelApi, loadFuels, cacheFuels);
    syncWithServer(jobsApi, loadJobs, cacheJobs);
    syncWithServer(paramsApi, loadParamRows, cacheParamRows);
  }, []);

  const addEntry = (m: number, date: string, amount: number): string => {
    const e: Entry = { id: uid(), m, date, amount };
    cache(entries.concat([e]));
    entriesApi.upsert(e).catch(() => {});
    return e.id;
  };

  // Výjezd; získaná zakázka s částkou se zapíše i jako zásah a naváže se na něj.
  const activeJob = useActiveJob();
  const addJob = (job: NewJob, entry: { m: number; date: string; amount: number } | null) => {
    if (jobPreset?.fromActive) activeJob.clear();
    const entryId = entry ? addEntry(entry.m, entry.date, entry.amount) : null;
    const j: JobLog = { ...job, id: uid(), entryId };
    cacheJobs(jobs.concat([j]));
    jobsApi.upsert(j).catch(() => {});
  };
  const removeJob = (id: string) => {
    cacheJobs(jobs.filter((j) => j.id !== id));
    jobsApi.remove(id).catch(() => {});
  };
  // Každá změna parametrů = nová verze (starší zůstávají na serveru).
  const saveParams = (next: ModelParams) => {
    const row: ParamsRow = { id: uid(), params: next };
    cacheParamRows(paramRows.concat([row]));
    paramsApi.upsert(row).catch(() => {});
  };
  const removeEntry = (id: string) => {
    cache(entries.filter((e) => e.id !== id));
    entriesApi.remove(id).catch(() => {});
  };
  const updateEntry = (id: string, amount: number, date?: string) => {
    let updated: Entry | undefined;
    const next = entries.map((e) => {
      if (e.id !== id) return e;
      updated = date && isISODate(date) ? { ...e, amount, date, m: periodOf(date).m } : { ...e, amount };
      return updated;
    });
    cache(next);
    if (updated) entriesApi.upsert(updated).catch(() => {});
  };

  const addFuel = (m: number, date: string, amount: number, liters: number | null) => {
    const f: Fuel = { id: uid(), m, date, amount, liters };
    cacheFuels(fuels.concat([f]));
    fuelApi.upsert(f).catch(() => {});
  };
  const removeFuel = (id: string) => {
    cacheFuels(fuels.filter((f) => f.id !== id));
    fuelApi.remove(id).catch(() => {});
  };
  const updateFuel = (id: string, amount: number, date: string, liters: number | null) => {
    let updated: Fuel | undefined;
    const next = fuels.map((f) => {
      if (f.id !== id) return f;
      updated = isISODate(date)
        ? { ...f, amount, date, liters, m: periodOf(date).m }
        : { ...f, amount, liters };
      return updated;
    });
    cacheFuels(next);
    if (updated) fuelApi.upsert(updated).catch(() => {});
  };

  const stats = useMemo(
    () => computeStats(entries, fuels, settings.selectedYear),
    [entries, fuels, settings.selectedYear],
  );
  const years = useMemo(() => availableYears(entries, fuels), [entries, fuels]);
  const activeMonths = useMemo(
    () => activeMonthsOf(stats.months, settings.selectedYear),
    [stats.months, settings.selectedYear],
  );
  // Souhrn měsíců pro každý rok zvlášť – sidebar je zobrazuje jako rozbalovací sekce.
  // U aktuálního roku doplníme i zbývající měsíce do konce roku (i bez záznamů).
  const yearGroups = useMemo(
    () =>
      years.map((y) => {
        const s = computeStats(entries, fuels, y);
        const months = new Set(activeMonthsOf(s.months, y));
        if (y === CURRENT_YEAR) {
          for (let i = CURRENT_MONTH; i <= 11; i++) months.add(i);
        }
        return {
          year: y,
          months: s.months,
          activeMonths: Array.from(months).sort((a, b) => a - b),
        };
      }),
    [entries, fuels, years],
  );

  // Měsíc bez záznamů (např. po smazání posledního zásahu) spadne na souhrn.
  // Měsíce do konce aktuálního roku jsou navigovatelné i bez záznamů (viz sidebar).
  const view: View =
    typeof rawView === "number" &&
    !activeMonths.includes(rawView) &&
    !(settings.selectedYear === CURRENT_YEAR && rawView >= CURRENT_MONTH)
      ? "dashboard"
      : rawView;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      const key = e.key.toLowerCase();
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !isInput;
      if (plain && (key === "n" || key === "t" || key === "v")) {
        e.preventDefault();
        openAdd(key === "n" ? "entry" : key === "t" ? "fuel" : "job");
      }
      if ((e.ctrlKey || e.metaKey) && key === "k") {
        e.preventDefault();
        openAdd("entry");
      }
      if (e.key === "Escape") setAddOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const go = (v: View, year?: number) => {
    if (year !== undefined && year !== settings.selectedYear) setSelectedYear(year);
    setView(v);
    setNavOpen(false);
    // Nová stránka začíná nahoře (jinak by přebrala scroll předchozí a large-title
    // by byl sbalený).
    window.scrollTo(0, 0);
  };

  // Menu je přepínač: otevře stránku Menu, a je-li otevřená, vrátí na předchozí pohled.
  const prevViewRef = useRef<View>("dashboard");
  const toggleMenu = () => {
    if (view === "menu") go(prevViewRef.current);
    else {
      prevViewRef.current = view;
      go("menu");
    }
  };

  return (
    <div className="od-app">
      {(view === "dashboard" || view === "menu" || view === "fuel" || view === "predict") && (
        <MobileTitleBar
          title={
            view === "menu"
              ? "Menu"
              : view === "fuel"
                ? `Tankování ${settings.selectedYear}`
                : view === "predict"
                  ? "Kde čekat"
                  : `Souhrn ${settings.selectedYear}`
          }
        />
      )}
      <div className="od-topbar">
        <button className="od-burger" onClick={() => setNavOpen(true)}>
          <Menu size={20} />
        </button>
        <div className="od-topbar-brand">
          <Logo size={24} /> Vydělkomat
        </div>
      </div>

      <div className="od-shell">
        {navOpen && <div className="od-backdrop" onClick={() => setNavOpen(false)} />}
        <Sidebar
          view={view}
          go={go}
          open={navOpen}
          onClose={() => setNavOpen(false)}
          yearGroups={yearGroups}
          onQuickAdd={() => openAdd("entry")}
          onFuelAdd={() => openAdd("fuel")}
          onJobAdd={() => openAdd("job")}
        />
        <main className="od-main">
          {view === "dashboard" ? (
            <Dashboard
              stats={stats}
              entries={entries}
              fuels={fuels}
              activeMonths={activeMonths}
              onEdit={updateEntry}
              onRequestDelete={setPendingDelete}
              onEditFuel={updateFuel}
              onRequestDeleteFuel={setPendingDeleteFuel}
              onAddFuel={() => openAdd("fuel")}
              onAddEntry={() => openAdd("entry")}
            />
          ) : view === "fuel" ? (
            <FuelView
              fuels={fuels.filter((f) => periodOf(f.date).y === settings.selectedYear)}
              year={settings.selectedYear}
              onAddClick={() => openAdd("fuel")}
              onEdit={updateFuel}
              onRequestDelete={setPendingDeleteFuel}
            />
          ) : view === "predict" ? (
            <Suspense fallback={<div className="od-panel pr-loading">Načítám mapu…</div>}>
            <PredictView
              params={params}
              jobs={jobs}
              onAddJob={(preset) => openAdd("job", preset)}
              activeJob={activeJob}
              alerts={alerts}
              geo={geo}
              onRequestDeleteJob={setPendingDeleteJob}
              onSaveParams={saveParams}
            />
            </Suspense>
          ) : view === "menu" ? (
            <MenuView view={view} go={go} yearGroups={yearGroups} />
          ) : (
            <MonthView
              m={view}
              entries={entries.filter((e) => {
                const p = periodOf(e.date);
                return p.m === view && p.y === settings.selectedYear;
              })}
              monthStat={stats.months[view]}
              onAdd={addEntry}
              onEdit={updateEntry}
              onRequestDelete={setPendingDelete}
            />
          )}
        </main>
      </div>

      <ConfirmModal
        entry={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            removeEntry(pendingDelete.id);
            setPendingDelete(null);
          }
        }}
      />

      <ConfirmModal
        entry={pendingDeleteFuel}
        noun="tankování"
        onCancel={() => setPendingDeleteFuel(null)}
        onConfirm={() => {
          if (pendingDeleteFuel) {
            removeFuel(pendingDeleteFuel.id);
            setPendingDeleteFuel(null);
          }
        }}
      />

      <ConfirmModal
        entry={pendingDeleteJob ? { date: pendingDeleteJob.calledAt, amount: 0 } : null}
        noun="výjezd"
        detail={
          pendingDeleteJob
            ? `${new Date(pendingDeleteJob.calledAt).toLocaleString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })} · dojezd ${pendingDeleteJob.travelMinutes} min`
            : undefined
        }
        onCancel={() => setPendingDeleteJob(null)}
        onConfirm={() => {
          if (pendingDeleteJob) {
            removeJob(pendingDeleteJob.id);
            setPendingDeleteJob(null);
          }
        }}
      />

      <AddModal
        open={addOpen}
        initialMode={addMode}
        onClose={() => setAddOpen(false)}
        onAddEntry={addEntry}
        onAddFuel={addFuel}
        onAddJob={addJob}
        params={params}
        jobPreset={jobPreset}
        myPos={geo.pos?.pos ?? null}
      />

      <TabBar
        view={view}
        onGo={(v) => go(v)}
        onAdd={() => openAdd(view === "fuel" ? "fuel" : view === "predict" ? "job" : "entry")}
        onMenu={toggleMenu}
      />
    </div>
  );
}
