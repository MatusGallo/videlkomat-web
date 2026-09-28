import { Fragment, useState } from "react";
import type { MonthStat, YearStat } from "../types";
import { MONTHS, MONTHS_SHORT, CURRENT_MONTH, CURRENT_YEAR, PROFIT_PCT, FUEL_COST_PCT } from "../constants";
import { useSettings } from "../utils/settings";
import { czk, num1, plural } from "../utils/format";
import { Dropdown } from "./Dropdown";
import { Kpi } from "./Kpi";
import { ChevronLeft, ChevronRight, Banknote, TrendingUp, Truck, Fuel as FuelIcon } from "../icons";

type SumView = "months" | "year";

type Props = {
  shown: MonthStat[];
  year: YearStat;
  active: number;
  activeMonths: number[];
};

type Group = "job" | "fuel" | "net";

type Row = {
  label: string;
  cell: (m: MonthStat) => string | number;
  yr: string | number;
  k: string;
  group: Group;
  has: (m: MonthStat) => boolean;
  // Řádky, kde barva závisí na znaménku (čistý zisk po palivu může být záporný).
  num?: (m: MonthStat) => number;
  numYr?: number;
};

const GROUP_LABEL: Record<Group, string> = {
  job: "Zásahy",
  fuel: "Palivo",
  net: "Výsledek",
};

// Čistý zisk po odečtení nákladu na palivo.
const netOf = (m: { profit: number; fuelCost: number }) => m.profit - m.fuelCost;

export function SummaryTable({ shown, year, active, activeMonths }: Props) {
  const { settings } = useSettings();
  const avgM = (s: number) => (active ? s / active : 0);
  const rows: Row[] = [
    { group: "job", has: (m) => m.count > 0, label: "Celková částka", cell: (m) => m.count ? czk(m.total) : "–", yr: czk(year.total), k: "strong" },
    { group: "job", has: (m) => m.count > 0, label: `Čistý zisk ${PROFIT_PCT} %`, cell: (m) => m.count ? czk(m.profit) : "–", yr: czk(year.profit), k: "profit" },
    { group: "job", has: (m) => m.count > 0, label: "Počet zásahů", cell: (m) => m.count || "–", yr: year.count, k: "" },
    { group: "job", has: (m) => m.count > 0, label: "Pracovní dny", cell: (m) => m.days || "–", yr: year.days, k: "" },
    { group: "job", has: (m) => m.count > 0, label: "Ø částka / zásah", cell: (m) => m.count ? czk(m.avgAmount) : "–", yr: czk(year.count ? year.total / year.count : 0), k: "" },
    { group: "job", has: (m) => m.count > 0, label: "Ø zisk / zásah", cell: (m) => m.count ? czk(m.avgProfit) : "–", yr: czk(year.count ? year.profit / year.count : 0), k: "profit" },
    { group: "job", has: (m) => m.days > 0, label: "Ø zisk / den", cell: (m) => m.days ? czk(m.avgProfitPerDay) : "–", yr: czk(year.avgProfitPerDay), k: "profit" },
    { group: "fuel", has: (m) => m.fuelTotal > 0, label: "Natankováno", cell: (m) => m.fuelTotal ? czk(m.fuelTotal) : "–", yr: czk(year.fuelTotal), k: "" },
    { group: "fuel", has: (m) => m.fuelTotal > 0, label: `Náklad palivo ${FUEL_COST_PCT} %`, cell: (m) => m.fuelCost ? "− " + czk(m.fuelCost) : "–", yr: year.fuelCost ? "− " + czk(year.fuelCost) : czk(0), k: "cost" },
    { group: "net", has: (m) => m.count > 0 || m.fuelTotal > 0, label: "Zisk po palivu", cell: (m) => (m.count || m.fuelTotal) ? czk(netOf(m)) : "–", yr: czk(netOf(year)), k: "profit", num: (m) => netOf(m), numYr: netOf(year) },
  ];
  // Kladná hodnota zeleně (profit), záporná červeně (loss).
  const signCls = (v: number) => (v < 0 ? "loss" : "profit");
  const isCurYear = settings.selectedYear === CURRENT_YEAR;
  const [mView, setMView] = useState<SumView>("year");

  // Mobil, režim „Měsíce": jeden měsíc s pickerem + šipkami. Default = aktuální měsíc.
  const [selMonth, setSelMonth] = useState(CURRENT_MONTH);
  const monthSel = activeMonths.includes(selMonth)
    ? selMonth
    : activeMonths.includes(CURRENT_MONTH)
      ? CURRENT_MONTH
      : activeMonths[activeMonths.length - 1] ?? CURRENT_MONTH;
  const selPos = activeMonths.indexOf(monthSel);
  const prevMonth = selPos > 0 ? activeMonths[selPos - 1] : null;
  const nextMonth = selPos >= 0 && selPos < activeMonths.length - 1 ? activeMonths[selPos + 1] : null;

  const monthsWord = plural(active, "měsíce", "měsíců", "měsíců");

  return (
    <>
      <div className="od-sum-switch">
        <div className="od-switch" role="tablist" aria-label="Zobrazení souhrnu">
          {([["months", "Měsíce"], ["year", "Rok"]] as const).map(([v, l]) => (
            <button
              key={v}
              role="tab"
              aria-selected={mView === v}
              className={"od-switch-btn" + (mView === v ? " is-active" : "")}
              onClick={() => setMView(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {mView === "months" && (
        <div className="od-sum-month-nav">
          <button
            className="od-monthnav-arr"
            onClick={() => prevMonth !== null && setSelMonth(prevMonth)}
            disabled={prevMonth === null}
            aria-label="Předchozí měsíc"
          >
            <ChevronLeft size={18} />
          </button>
          <Dropdown
            className="od-monthnav-dd"
            ariaLabel="Vyber měsíc"
            value={monthSel}
            onChange={setSelMonth}
            options={activeMonths.map((i) => ({ value: i, label: `${MONTHS[i]} ${settings.selectedYear}` }))}
          />
          <button
            className="od-monthnav-arr"
            onClick={() => nextMonth !== null && setSelMonth(nextMonth)}
            disabled={nextMonth === null}
            aria-label="Další měsíc"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      <div className="od-table-wrap">
      <table className={"od-table od-summary m-" + mView + " sel-" + monthSel}>
        <thead>
          <tr>
            <th className="sticky">Metrika</th>
            {activeMonths.map((i) => (
              <th key={i} className={"r mc mc-" + i + (isCurYear && i === CURRENT_MONTH ? " is-cur" : "")}>
                {MONTHS_SHORT[i]}
              </th>
            ))}
            <th className="r yr">Rok</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const newGroup = ri === 0 || rows[ri - 1].group !== row.group;
            const cellK = (m: MonthStat) => (row.num ? signCls(row.num(m)) : row.k);
            const yrK = row.numYr !== undefined ? signCls(row.numYr) : row.k;
            return (
              <Fragment key={ri}>
                {newGroup && (
                  <tr className="od-sum-group" aria-hidden="true">
                    <th className="sticky rowhead od-sum-group-lbl">{GROUP_LABEL[row.group]}</th>
                    {shown.map((_, mi) => (
                      <td key={mi} className={"mc mc-" + activeMonths[mi]} />
                    ))}
                    <td className="yr" />
                  </tr>
                )}
                <tr className={"od-sum-row g-" + row.group}>
                  <th className="sticky rowhead">{row.label}</th>
                  {shown.map((m, mi) => (
                    <td key={mi} className={"r mono mc mc-" + activeMonths[mi] + " " + cellK(m) + (row.has(m) ? "" : " faint")}>
                      {row.cell(m)}
                    </td>
                  ))}
                  <td className={"r mono yr " + yrK}>{row.yr}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>

      <div className="od-avg">
        <div className="od-avg-head">
          <span className="od-avg-title">Měsíční průměr</span>
          <span className="od-avg-sub">z {active} {monthsWord} se záznamy</span>
        </div>
        <div className="od-kpis od-kpis-avg">
          <Kpi
            label="Ø obrat / měs"
            value={czk(avgM(year.total))}
            icon={<Banknote size={18} />}
            foot="hrubý obrat"
          />
          <Kpi
            label={`Ø zisk ${PROFIT_PCT} % / měs`}
            value={czk(avgM(year.profit))}
            icon={<TrendingUp size={18} />}
            accent
            foot={`${PROFIT_PCT} % z obratu`}
          />
          <Kpi
            label="Ø zásahů / měs"
            value={num1(avgM(year.count))}
            icon={<Truck size={18} />}
            foot={`${year.count} za rok`}
          />
          <Kpi
            label="Ø palivo / měs"
            value={czk(avgM(year.fuelCost))}
            icon={<FuelIcon size={18} />}
            foot={`náklad ${FUEL_COST_PCT} %`}
          />
        </div>
      </div>
    </>
  );
}
