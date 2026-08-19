import { useMemo, useState } from "react";
import type { Entry, Fuel, Stats, TrendMode, TrendPoint } from "../types";
import { MONTHS, MONTHS_SHORT, CURRENT_MONTH, CURRENT_YEAR, PROFIT_RATE, PROFIT_PCT, FUEL_COST_RATE, VAT_RATE, VAT_PCT } from "../constants";
import { czk, dateLabel, parseAmount, todayISO } from "../utils/format";
import { dayStat, monthChange, periodOf } from "../utils/stats";
import { useSettings } from "../utils/SettingsContext";
import { useRowEdit } from "../hooks/useRowEdit";
import { Truck, Banknote, TrendingUp, Fuel as FuelIcon, Wallet, Plus } from "../icons";
import { Kpi } from "./Kpi";
import { LineTrend } from "./LineTrend";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { SummaryTable } from "./SummaryTable";
import { AmountInput, DateInput, RowActions } from "./RowActions";
import { FuelRecords } from "./FuelRecords";
import { Dropdown } from "./Dropdown";

type Props = {
  stats: Stats;
  entries: Entry[];
  fuels: Fuel[];
  activeMonths: number[];
  onEdit: (id: string, amount: number, date?: string) => void;
  onRequestDelete: (entry: Entry) => void;
  onEditFuel: (id: string, amount: number, date: string, liters: number | null) => void;
  onRequestDeleteFuel: (fuel: Fuel) => void;
  onAddFuel: () => void;
  onAddEntry: () => void;
};

export function Dashboard({ stats, entries, fuels, activeMonths, onEdit, onRequestDelete, onEditFuel, onRequestDeleteFuel, onAddFuel, onAddEntry }: Props) {
  const { settings } = useSettings();
  const year = stats.year;
  const months = stats.months;
  const shown = activeMonths.map((i) => months[i]);
  const active = shown.filter((m) => m.count > 0).length;
  const ed = useRowEdit(onEdit);
  const yearEntries = entries.filter((e) => periodOf(e.date).y === settings.selectedYear);
  const filtered = useMemo(
    () =>
      yearEntries
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [yearEntries],
  );
  const visible = filtered.slice(0, 10);
  const yearFuels = fuels.filter((f) => periodOf(f.date).y === settings.selectedYear);

  const day = useMemo(() => dayStat(entries, todayISO()), [entries]);
  const todayFuelCost = useMemo(() => {
    const t = todayISO();
    return fuels.filter((f) => f.date === t).reduce((s, f) => s + f.amount, 0) * FUEL_COST_RATE;
  }, [fuels]);
  const todayProfit = day.total * PROFIT_RATE;
  const todayNet = todayProfit - todayFuelCost;

  // V dropdownu: měsíce se záznamy + (u aktuálního roku) aktuální a budoucí měsíce.
  // Minulé prázdné měsíce vynecháme – nikdy v nich žádný zápis nebude.
  const monthOptions = (() => {
    const set = new Set<number>(activeMonths);
    if (settings.selectedYear === CURRENT_YEAR) {
      for (let i = CURRENT_MONTH; i <= 11; i++) set.add(i);
    }
    return Array.from(set).sort((a, b) => a - b);
  })();
  const [selMonth, setSelMonth] = useState(CURRENT_MONTH);
  const monthInView = selMonth >= 0 && selMonth <= 11 ? selMonth : CURRENT_MONTH;
  const month = months[monthInView];

  const [trendMode, setTrendMode] = useState<TrendMode>("days");

  const trendPoints = useMemo<TrendPoint[]>(() => {
    if (trendMode === "months") {
      return activeMonths.map((i) => ({
        label: MONTHS_SHORT[i],
        fullLabel: `${MONTHS[i]} ${settings.selectedYear}`,
        total: months[i].total,
        profit: months[i].profit,
        count: months[i].count,
        isCurrent: i === CURRENT_MONTH && settings.selectedYear === CURRENT_YEAR,
      }));
    }
    if (trendMode === "days") {
      if (yearEntries.length === 0) return [];
      const byDate = new Map<string, { total: number; count: number }>();
      yearEntries.forEach((e) => {
        const cur = byDate.get(e.date) || { total: 0, count: 0 };
        cur.total += e.amount;
        cur.count += 1;
        byDate.set(e.date, cur);
      });
      const today = todayISO();
      // Jen pracovní dny = dny, kdy existuje aspoň jeden záznam (žádné mezery
      // za prázdné kalendářní dny). Seřazené chronologicky.
      return Array.from(byDate.keys())
        .sort()
        .map((iso) => {
          const v = byDate.get(iso)!;
          return {
            label: dateLabel(iso),
            fullLabel: iso,
            total: v.total,
            profit: v.total * PROFIT_RATE,
            count: v.count,
            isCurrent: iso === today,
          };
        });
    }
    const byYear = new Map<string, { total: number; count: number }>();
    entries.forEach((e) => {
      const y = String(periodOf(e.date).y);
      const cur = byYear.get(y) || { total: 0, count: 0 };
      cur.total += e.amount;
      cur.count += 1;
      byYear.set(y, cur);
    });
    const curY = String(CURRENT_YEAR);
    return Array.from(byYear.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([y, v]) => ({
        label: y,
        fullLabel: `Rok ${y}`,
        total: v.total,
        profit: v.total * PROFIT_RATE,
        count: v.count,
        isCurrent: y === curY,
      }));
  }, [trendMode, entries, yearEntries, months, activeMonths, settings.selectedYear]);

  const hasTrendData = trendPoints.some((p) => p.count > 0);
  const trendTitle =
    trendMode === "days" ? "Vývoj po dnech"
    : trendMode === "years" ? "Vývoj po letech"
    : `Vývoj v roce ${settings.selectedYear}`;

  return (
    <div className="od-fade">
      <div className="od-head"><h1>Souhrn {settings.selectedYear}</h1></div>

      <div className="od-kpis-solo">
        <Kpi
          label={todayFuelCost > 0 ? "Dnešní zisk po palivu" : "Dnešní zisk"}
          value={czk(todayFuelCost > 0 ? todayNet : todayProfit)}
          accent
          change={day.total > 0 ? day.change : undefined}
          changeLabel="vs. předchozí den"
          extraFoot={
            todayFuelCost > 0
              ? `Bez paliva: ${czk(todayProfit)} (− ${czk(todayFuelCost)} palivo)`
              : day.prevDate
                ? `Předchozí den: ${czk(day.prev * PROFIT_RATE)}`
                : undefined
          }
          foot={day.total === 0 && todayFuelCost === 0 ? "zatím dnes žádný zápis" : undefined}
        />
      </div>

      <div className="od-kpis-bar">
        <span className="od-kpis-bar-label">Přehled za měsíc</span>
        <Dropdown
          ariaLabel="Vyber měsíc"
          value={monthInView}
          onChange={setSelMonth}
          options={monthOptions.map((i) => ({
            value: i,
            label:
              `${MONTHS[i]} ${settings.selectedYear}` +
              (i === CURRENT_MONTH && settings.selectedYear === CURRENT_YEAR ? " - aktuální" : ""),
          }))}
        />
      </div>

      <div className="od-kpis od-kpis-fuel">
        <Kpi
          label="Celkový obrat"
          value={czk(month.total)}
          icon={<Banknote size={18} />}
          change={monthChange(months, monthInView, (m) => m.total)}
          extraFoot={`Bez DPH: ${czk(month.total / (1 + VAT_RATE))} (DPH ${VAT_PCT} %)`}
        />
        <Kpi
          label="Čistý zisk"
          value={czk(month.profit)}
          icon={<TrendingUp size={18} />}
          accent
          change={monthChange(months, monthInView, (m) => m.profit)}
          extraFoot={month.days ? `Ø ${czk(month.avgProfitPerDay)} / den (${month.days} dní)` : undefined}
        />
        <Kpi
          label="Počet zásahů"
          value={String(month.count)}
          unit="zásahů"
          icon={<Truck size={18} />}
          change={monthChange(months, monthInView, (m) => m.count)}
        />
        <Kpi
          label="Palivo"
          value={czk(month.fuelCost)}
          icon={<FuelIcon size={18} />}
          change={monthChange(months, monthInView, (m) => m.fuelCost)}
          foot={month.fuelTotal === 0 ? "žádné tankování v měsíci" : undefined}
          extraFoot={month.fuelTotal > 0 ? `Natankováno ${czk(month.fuelTotal)}` : undefined}
        />
        <Kpi
          label="Zisk po palivu"
          value={czk(month.profit - month.fuelCost)}
          icon={<Wallet size={18} />}
          change={monthChange(months, monthInView, (m) => m.profit - m.fuelCost)}
          extraFoot={
            month.fuelCost > 0
              ? `Čistý zisk ${czk(month.profit)} − palivo ${czk(month.fuelCost)}`
              : "žádné palivo v měsíci"
          }
        />
      </div>

      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">{trendTitle}</div>
          <div className="od-panel-tools">
            <div className="od-switch" role="tablist" aria-label="Režim grafu">
              {(["days", "months", "years"] as TrendMode[]).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={trendMode === m}
                  className={"od-switch-btn" + (trendMode === m ? " is-active" : "")}
                  onClick={() => setTrendMode(m)}
                >
                  {m === "days" ? "Dny" : m === "months" ? "Měsíce" : "Roky"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {hasTrendData ? (
          <>
            <LineTrend points={trendPoints} />
            <div className="od-legend od-legend-below">
              <span className="od-leg"><span className="dot o" /> Obrat</span>
              <span className="od-leg"><span className="dot n" /> Zisk</span>
            </div>
          </>
        ) : (
          <div className="od-empty od-empty-cta">
            <div className="od-empty-ico"><Truck size={26} /></div>
            <div className="od-empty-title">Zatím žádná data</div>
            <div className="od-empty-sub">Přidej zásahy a uvidíš tu vývoj obratu a zisku.</div>
            <button className="od-add" onClick={onAddEntry}>
              <Plus size={16} /> Přidat zásah
            </button>
          </div>
        )}
      </section>

      <section className="od-panel">
        <div className="od-panel-head" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="od-panel-title">Aktivita</div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>
              počet zásahů za den
            </span>
          </div>
          <span className="ah-legend">
            Méně
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={"ah-cell ah-l" + l} />
            ))}
            Více
          </span>
        </div>
        <ActivityHeatmap entries={entries} year={settings.selectedYear} />
      </section>

      <section className="od-panel">
        <div className="od-panel-head"><div className="od-panel-title">Roční souhrn</div></div>
        <SummaryTable shown={shown} year={year} active={active} activeMonths={activeMonths} />
        <p className="od-note">
          <b>Rok</b> = součet (u průměrů celkový průměr). <b>Měsíční průměr</b> = z měsíců se záznamy ({active} z {activeMonths.length}).
        </p>
      </section>

      <div className="od-records-split">
        <section className="od-panel">
          <div className="od-panel-head">
            <div className="od-panel-title">Zásahy</div>
          </div>
          {visible.length === 0 ? (
            <div className="od-empty od-empty-cta">
              <div className="od-empty-ico"><Truck size={26} /></div>
              <div className="od-empty-title">Zatím žádné zásahy</div>
              <div className="od-empty-sub">Přidej první zásah pro tento rok.</div>
              <button className="od-add" onClick={onAddEntry}>
                <Plus size={16} /> Přidat zásah
              </button>
            </div>
          ) : (
            <div className="od-table-wrap">
              <table className="od-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Měsíc</th>
                    <th className="r">Částka</th>
                    <th className="r">Zisk {PROFIT_PCT} %</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => {
                    const editing = ed.editId === e.id;
                    const prev = editing ? parseAmount(ed.editVal) || 0 : e.amount;
                    const monthIdx = editing ? periodOf(ed.editDate).m : periodOf(e.date).m;
                    return (
                      <tr key={e.id}>
                        <td className="mono">
                          {editing ? <DateInput ed={ed} /> : dateLabel(e.date)}
                        </td>
                        <td>{MONTHS[Number.isFinite(monthIdx) ? monthIdx : periodOf(e.date).m]}</td>
                        <td className="r mono strong">
                          {editing ? <AmountInput ed={ed} /> : czk(e.amount)}
                        </td>
                        <td className="r mono profit">{czk(prev * PROFIT_RATE)}</td>
                        <td className="r">
                          <RowActions e={e} ed={ed} onRequestDelete={onRequestDelete} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > visible.length && (
            <p className="od-note">Zobrazeno {visible.length} z {filtered.length} záznamů.</p>
          )}
        </section>

        <section className="od-panel">
          <div className="od-panel-head">
            <div className="od-panel-title">Palivo</div>
          </div>
          {yearFuels.length === 0 ? (
            <div className="od-empty od-empty-cta">
              <div className="od-empty-ico"><FuelIcon size={26} /></div>
              <div className="od-empty-title">Zatím žádné tankování</div>
              <div className="od-empty-sub">
                Zapiš, kolik jsi natankoval — 30 % si vezmeš jako svůj náklad.
              </div>
              <button className="od-add" onClick={onAddFuel}>
                <Plus size={16} /> Přidat tankování
              </button>
            </div>
          ) : (
            <>
              <FuelRecords
                fuels={yearFuels}
                onEdit={onEditFuel}
                onRequestDelete={onRequestDeleteFuel}
              />
              {yearFuels.length > 10 && (
                <p className="od-note">Zobrazeno 10 z {yearFuels.length} tankování.</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
