import { useState } from "react";
import type { Fuel } from "../types";
import { FUEL_COST_RATE, FUEL_COST_PCT } from "../constants";
import { byDateDesc, czk, dateLabel, groupAmount, num1, parseAmount, plural, toInputAmount, weekdayLabel } from "../utils/format";
import { useRowEdit } from "../hooks/useRowEdit";
import { Fuel as FuelIcon, Droplet, Banknote, Plus } from "../icons";
import { Kpi } from "./Kpi";
import { Panel } from "./Panel";
import { AmountInput, DateInput, InlineInput, RowActions } from "./RowActions";

type Props = {
  fuels: Fuel[];
  year: number;
  onAddClick: () => void;
  onEdit: (id: string, amount: number, date: string, liters: number | null) => void;
  onRequestDelete: (fuel: Fuel) => void;
};

export function FuelView({ fuels, year, onAddClick, onEdit, onRequestDelete }: Props) {
  const [editLiters, setEditLiters] = useState("");
  const ed = useRowEdit<Fuel>(
    (id, amount, date) => {
      const empty = editLiters.trim() === "";
      const l = empty ? null : parseAmount(editLiters);
      if (!empty && (l === null || l <= 0)) return false;
      onEdit(id, amount, date, l);
    },
    (f) => setEditLiters(f.liters == null ? "" : toInputAmount(f.liters)),
  );

  const sorted = fuels.slice().sort(byDateDesc);
  const byDay: [string, Fuel[]][] = [];
  sorted.forEach((f) => {
    const last = byDay[byDay.length - 1];
    if (last && last[0] === f.date) last[1].push(f);
    else byDay.push([f.date, [f]]);
  });

  const totalAmount = fuels.reduce((s, f) => s + f.amount, 0);
  const totalCost = totalAmount * FUEL_COST_RATE;
  const withLiters = fuels.filter((f) => f.liters != null && f.liters > 0);
  const litersSum = withLiters.reduce((s, f) => s + (f.liters as number), 0);
  const amountWithLiters = withLiters.reduce((s, f) => s + f.amount, 0);
  const avgPerLiter = litersSum > 0 ? amountWithLiters / litersSum : 0;

  return (
    <div className="od-fade">
      <div className="od-head">
        <h1>Tankování {year}</h1>
      </div>

      <div className="od-kpis">
        <Kpi
          label="Natankováno celkem"
          value={czk(totalAmount)}
          icon={<FuelIcon size={18} />}
          foot={`${fuels.length} ${plural(fuels.length, "tankování", "tankování", "tankování")}`}
        />
        <Kpi
          label={`Můj náklad ${FUEL_COST_PCT} %`}
          value={czk(totalCost)}
          icon={<Banknote size={18} />}
          accent
          foot="odečítá se z čistého zisku"
        />
        <Kpi
          label="Ø cena za litr"
          value={avgPerLiter ? `${num1(avgPerLiter)} Kč/L` : "–"}
          icon={<Droplet size={18} />}
          foot={litersSum > 0 ? `${num1(litersSum)} L celkem` : "zadej litry pro dopočet"}
        />
      </div>

      <Panel
        bare={sorted.length > 0}
        title="Záznamy tankování"
        icon={<FuelIcon size={16} />}
        tools={
          sorted.length > 0 && (
            <button className="od-add od-add-sm" onClick={onAddClick}>
              <Plus size={16} /> Přidat tankování
            </button>
          )
        }
      >
        {sorted.length === 0 ? (
          <div className="od-empty od-empty-cta">
            <div className="od-empty-ico"><FuelIcon size={26} /></div>
            <div className="od-empty-title">Zatím žádné tankování v roce {year}</div>
            <div className="od-empty-sub">
              Zapiš, kolik jsi natankoval — 30 % si vezmeš jako svůj náklad.
            </div>
            <button className="od-add" onClick={onAddClick}>
              <Plus size={16} /> Přidat tankování
            </button>
          </div>
        ) : (
          <div className="od-days">
            {byDay.map(([day, items]) => {
              const dayTotal = items.reduce((s, f) => s + f.amount, 0);
              return (
                <div className="od-day" key={day}>
                  <div className="od-day-head">
                    <span className="od-day-date mono">{dateLabel(day)}</span>
                    <span className="od-day-wd">{weekdayLabel(day)}</span>
                    <span className="od-day-count">
                      {items.length} {plural(items.length, "tankování", "tankování", "tankování")}
                    </span>
                    <span className="od-day-sum mono">{czk(dayTotal)}</span>
                  </div>
                  <div className="od-table-wrap">
                    <table className="od-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Datum</th>
                          <th className="r">Natankováno</th>
                          <th className="r">Litry</th>
                          <th className="r">Kč/L</th>
                          <th className="r">Náklad {FUEL_COST_PCT} %</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((f, i) => {
                          const editing = ed.editId === f.id;
                          const amt = editing ? parseAmount(ed.editVal) || 0 : f.amount;
                          const liters = editing ? parseAmount(editLiters) : f.liters;
                          const pl = liters && liters > 0 ? amt / liters : null;
                          return (
                            <tr key={f.id}>
                              <td className="faint mono">{i + 1}</td>
                              <td className="mono">{editing ? <DateInput ed={ed} /> : dateLabel(f.date)}</td>
                              <td className="r mono strong">{editing ? <AmountInput ed={ed} /> : czk(f.amount)}</td>
                              <td className="r mono">
                                {editing ? (
                                  <InlineInput
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="–"
                                    value={editLiters}
                                    onValue={(v) => setEditLiters(groupAmount(v))}
                                    onSave={ed.save}
                                    onCancel={ed.cancel}
                                  />
                                ) : f.liters && f.liters > 0 ? (
                                  `${num1(f.liters)} L`
                                ) : (
                                  <span className="faint">–</span>
                                )}
                              </td>
                              <td className="r mono">{pl ? `${num1(pl)}` : <span className="faint">–</span>}</td>
                              <td className="r mono profit">{czk(amt * FUEL_COST_RATE)}</td>
                              <td className="r">
                                <RowActions e={f} ed={ed} onRequestDelete={onRequestDelete} />
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
