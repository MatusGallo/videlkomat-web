import { useEffect, useMemo, useState } from "react";
import type { Entry, Fuel, View } from "./types";
import { loadEntries, saveEntries, loadFuels, saveFuels } from "./utils/storage";
import { apiList, apiUpsert, apiDelete, fuelList, fuelUpsert, fuelDelete } from "./utils/api";
import { activeMonthsOf, availableYears, computeStats, periodOf } from "./utils/stats";
import { CURRENT_MONTH, CURRENT_YEAR } from "./constants";
import { uid } from "./utils/format";
import { useSettings } from "./utils/SettingsContext";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { MonthView } from "./components/MonthView";
import { FuelView } from "./components/FuelView";
import { ConfirmModal } from "./components/ConfirmModal";
import { QuickAddModal } from "./components/QuickAddModal";
import { FuelModal } from "./components/FuelModal";
import { Logo, Menu, Plus, Fuel as FuelIcon } from "./icons";

export default function App() {
  const { settings, setSelectedYear } = useSettings();
  const [entries, setEntries] = useState<Entry[]>(loadEntries);
  const [fuels, setFuels] = useState<Fuel[]>(loadFuels);
  const [view, setView] = useState<View>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [pendingDeleteFuel, setPendingDeleteFuel] = useState<Fuel | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [fuelOpen, setFuelOpen] = useState(false);

  // Aktualizuj UI + lokální cache okamžitě (optimistic update).
  const cache = (next: Entry[]) => {
    setEntries(next);
    saveEntries(next);
  };
  const cacheFuels = (next: Fuel[]) => {
    setFuels(next);
    saveFuels(next);
  };

  // Při startu sesynchronizuj s serverem. Lokální záznamy, které na serveru
  // chybí (první migrace z localStorage nebo offline úpravy), nahraj nahoru;
  // u konfliktů podle id vítězí server. Offline → ponecháme lokální cache.
  useEffect(() => {
    apiList()
      .then(async (server) => {
        const serverIds = new Set(server.map((e) => e.id));
        const localOnly = loadEntries().filter((e) => !serverIds.has(e.id));
        await Promise.all(localOnly.map((e) => apiUpsert(e).catch(() => {})));
        cache(server.concat(localOnly));
      })
      .catch(() => {
        /* offline / chyba serveru: pokračujeme s lokální cache */
      });
    fuelList()
      .then(async (server) => {
        const serverIds = new Set(server.map((f) => f.id));
        const localOnly = loadFuels().filter((f) => !serverIds.has(f.id));
        await Promise.all(localOnly.map((f) => fuelUpsert(f).catch(() => {})));
        cacheFuels(server.concat(localOnly));
      })
      .catch(() => {
        /* offline / chyba serveru: pokračujeme s lokální cache */
      });
  }, []);

  const addEntry = (m: number, date: string, amount: number) => {
    const e: Entry = { id: uid(), m, date, amount };
    cache(entries.concat([e]));
    apiUpsert(e).catch(() => {});
  };
  const removeEntry = (id: string) => {
    cache(entries.filter((e) => e.id !== id));
    apiDelete(id).catch(() => {});
  };
  const updateEntry = (id: string, amount: number, date?: string) => {
    let updated: Entry | undefined;
    const next = entries.map((e) => {
      if (e.id !== id) return e;
      updated =
        date && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? { ...e, amount, date, m: parseInt(date.slice(5, 7), 10) - 1 }
          : { ...e, amount };
      return updated;
    });
    cache(next);
    if (updated) apiUpsert(updated).catch(() => {});
  };

  const addFuel = (m: number, date: string, amount: number, liters: number | null) => {
    const f: Fuel = { id: uid(), m, date, amount, liters };
    cacheFuels(fuels.concat([f]));
    fuelUpsert(f).catch(() => {});
  };
  const removeFuel = (id: string) => {
    cacheFuels(fuels.filter((f) => f.id !== id));
    fuelDelete(id).catch(() => {});
  };
  const updateFuel = (id: string, amount: number, date: string, liters: number | null) => {
    let updated: Fuel | undefined;
    const next = fuels.map((f) => {
      if (f.id !== id) return f;
      updated = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? { ...f, amount, date, liters, m: parseInt(date.slice(5, 7), 10) - 1 }
        : { ...f, amount, liters };
      return updated;
    });
    cacheFuels(next);
    if (updated) fuelUpsert(updated).catch(() => {});
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

  useEffect(() => {
    // Měsíce do konce aktuálního roku jsou navigovatelné i bez záznamů (viz sidebar).
    const isFutureCurrentYear =
      settings.selectedYear === CURRENT_YEAR && typeof view === "number" && view >= CURRENT_MONTH;
    if (typeof view === "number" && !activeMonths.includes(view) && !isFutureCurrentYear) {
      setView("dashboard");
    }
  }, [activeMonths, view, settings.selectedYear]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if ((e.key === "n" || e.key === "N") && !e.ctrlKey && !e.metaKey && !e.altKey && !isInput) {
        e.preventDefault();
        setQuickOpen(true);
      }
      if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey && !e.altKey && !isInput) {
        e.preventDefault();
        setFuelOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setQuickOpen(true);
      }
      if (e.key === "Escape") {
        setQuickOpen(false);
        setFuelOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const go = (v: View, year?: number) => {
    if (year !== undefined && year !== settings.selectedYear) setSelectedYear(year);
    setView(v);
    setNavOpen(false);
  };

  return (
    <div className="od-app">
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
          onQuickAdd={() => setQuickOpen(true)}
          onFuelAdd={() => setFuelOpen(true)}
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
              onAddFuel={() => setFuelOpen(true)}
            />
          ) : view === "fuel" ? (
            <FuelView
              fuels={fuels.filter((f) => periodOf(f.date).y === settings.selectedYear)}
              year={settings.selectedYear}
              onAddClick={() => setFuelOpen(true)}
              onEdit={updateFuel}
              onRequestDelete={setPendingDeleteFuel}
            />
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

      <QuickAddModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onAdd={addEntry}
      />

      <FuelModal
        open={fuelOpen}
        onClose={() => setFuelOpen(false)}
        onAdd={addFuel}
      />

      <button
        className="od-fab-menu"
        onClick={() => setNavOpen(true)}
        aria-label="Otevřít menu"
        title="Menu"
      >
        <Menu size={22} />
      </button>

      <button
        className="od-fab-fuel"
        onClick={() => setFuelOpen(true)}
        aria-label="Přidat tankování"
        title="Přidat tankování"
      >
        <FuelIcon size={22} />
      </button>

      <button
        className="od-fab"
        onClick={() => setQuickOpen(true)}
        aria-label="Přidat zásah"
        title="Přidat zásah"
      >
        <Plus size={20} /> <span>Přidat zásah</span>
      </button>
    </div>
  );
}
