import { useRef, useState } from "react";
import type { Entry, MonthStat } from "../types";
import { MONTHS, CURRENT_MONTH, CURRENT_YEAR, PROFIT_RATE, PROFIT_PCT } from "../constants";
import { byDateDesc, czk, dateLabel, groupAmount, parseAmount, todayISO, weekdayLabel, plural } from "../utils/format";
import { useSettings } from "../utils/settings";
import { useRowEdit } from "../hooks/useRowEdit";
import { Truck, Plus, Banknote, TrendingUp, Wallet } from "../icons";
import { Kpi } from "./Kpi";
import { Panel } from "./Panel";
import { AmountInput, DateInput, RowActions } from "./RowActions";
import { DateField } from "./DateField";

type Props = {
  m: number;
  entries: Entry[];
  monthStat: MonthStat;
  onAdd: (m: number, date: string, amount: number) => void;
  onEdit: (id: string, amount: number, date?: string) => void;
  onRequestDelete: (entry: Entry) => void;
};

export function MonthView({ m, entries, monthStat, onAdd, onEdit, onRequestDelete }: Props) {
  const { settings } = useSettings();
  const year = settings.selectedYear;
  const isCurrent = CURRENT_MONTH === m && CURRENT_YEAR === year;
  const defaultDate = isCurrent
    ? todayISO()
    : year + "-" + String(m + 1).padStart(2, "0") + "-01";
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const ed = useRowEdit(onEdit);
  const sorted = entries.slice().sort(byDateDesc);
  // Seskup zásahy po dnech (nejbližší/nejnovější den první) – jeden den = jedna tabulka se souhrnem.
  const byDay: [string, Entry[]][] = [];
  sorted.forEach((e) => {
    const last = byDay[byDay.length - 1];
    if (last && last[0] === e.date) last[1].push(e);
    else byDay.push([e.date, [e]]);
  });
  const previewAmount = parseAmount(amount);

  const submit = () => {
    const v = parseAmount(amount);
    if (v === null || v <= 0) {
      setErr("Zadej platnou částku větší než 0.");
      return;
    }
    onAdd(m, date, v);
    setAmount("");
    setErr("");
    if (ref.current) ref.current.focus();
  };

  return (
    <div className="od-fade">
      <div className="od-head">
        <h1>{MONTHS[m]} {year}</h1>
      </div>

      <div className="od-kpis od-kpis-avg">
        <Kpi
          label="Zisk po palivu"
          value={czk(monthStat.profit - monthStat.fuelCost)}
          icon={<Wallet size={18} />}
          accent
          foot={
            monthStat.fuelCost > 0
              ? `Čistý zisk ${czk(monthStat.profit)} − palivo ${czk(monthStat.fuelCost)}`
              : "žádné palivo v měsíci"
          }
        />
        <Kpi
          label="Celková částka"
          value={czk(monthStat.total)}
          icon={<Banknote size={18} />}
          foot={"Ø " + czk(monthStat.avgAmount)}
        />
        <Kpi
          label="Čistý zisk"
          value={czk(monthStat.profit)}
          icon={<TrendingUp size={18} />}
          foot={"Ø " + czk(monthStat.avgProfit)}
          extraFoot={monthStat.days ? `Ø ${czk(monthStat.avgProfitPerDay)} / den (${monthStat.days} dní)` : undefined}
        />
        <Kpi
          label="Počet zásahů"
          value={String(monthStat.count)}
          unit="zásahů"
          icon={<Truck size={18} />}
          foot={MONTHS[m] + " " + year}
        />
      </div>

      {isCurrent && (
        <Panel title="Nový zásah" icon={<Plus size={16} />}>
          <div className="od-form">
            <div className="od-field">
              <label>Datum</label>
              <DateField value={date} onChange={setDate} />
            </div>
            <div className="od-field grow">
              <label>Celková částka (Kč)</label>
              <input
                ref={ref}
                type="text"
                inputMode="decimal"
                placeholder="např. 3 500"
                value={amount}
                onChange={(e) => setAmount(groupAmount(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
            <div className="od-field">
              <label>Zisk {PROFIT_PCT} %</label>
              <div className="od-preview mono">
                {previewAmount ? czk(previewAmount * PROFIT_RATE) : "–"}
              </div>
            </div>
            <button className="od-add" onClick={submit}>
              <Plus size={16} /> Přidat
            </button>
          </div>
          {err && <p className="od-err">{err}</p>}
        </Panel>
      )}

      <Panel
        bare={sorted.length > 0}
        className="od-records"
        icon={<Truck size={16} />}
        title={
          <>
            Záznamy · {monthStat.count} {plural(monthStat.count, "zásah", "zásahy", "zásahů")}
            {byDay.length > 0 && ` · ${byDay.length} ${plural(byDay.length, "den", "dny", "dní")}`}
          </>
        }
      >
        {sorted.length === 0 ? (
          <div className="od-empty">
            <Truck size={34} />
            <span>Zatím žádné zásahy v měsíci {MONTHS[m].toLowerCase()}.</span>
          </div>
        ) : (
          <div className="od-days">
            {byDay.map(([day, items]) => {
              const dayTotal = items.reduce((s, e) => s + e.amount, 0);
              return (
                <div className="od-day" key={day}>
                  <div className="od-day-head">
                    <span className="od-day-date mono">{dateLabel(day)}</span>
                    <span className="od-day-wd">{weekdayLabel(day)}</span>
                    <span className="od-day-count">
                      {items.length} {plural(items.length, "zásah", "zásahy", "zásahů")}
                    </span>
                    <span className="od-day-sum mono">{czk(dayTotal)}</span>
                  </div>
                  <div className="od-table-wrap">
                    <table className="od-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Datum</th>
                          <th className="r">Částka</th>
                          <th className="r">Zisk {PROFIT_PCT} %</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((e, i) => {
                          const editing = ed.editId === e.id;
                          const prev = editing ? parseAmount(ed.editVal) || 0 : e.amount;
                          return (
                            <tr key={e.id}>
                              <td className="faint mono">{i + 1}</td>
                              <td className="mono">
                                {editing ? <DateInput ed={ed} /> : dateLabel(e.date)}
                              </td>
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
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
