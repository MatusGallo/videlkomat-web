import { useState } from "react";
import type { Fuel } from "../types";
import { FUEL_COST_RATE, FUEL_COST_PCT } from "../constants";
import { czk, dateLabel, groupAmount, num1, parseAmount, plural, weekdayLabel } from "../utils/format";
import { Fuel as FuelIcon, Droplet, Banknote, Plus, Check, X, Pencil, Trash } from "../icons";
import { Kpi } from "./Kpi";

type Props = {
  fuels: Fuel[];
  year: number;
  onAddClick: () => void;
  onEdit: (id: string, amount: number, date: string, liters: number | null) => void;
  onRequestDelete: (fuel: Fuel) => void;
};

export function FuelView({ fuels, year, onAddClick, onEdit, onRequestDelete }: Props) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editLiters, setEditLiters] = useState("");

  const start = (f: Fuel) => {
    setEditId(f.id);
    setEditAmount(groupAmount(String(f.amount).replace(".", ",")));
    setEditDate(f.date);
    setEditLiters(f.liters == null ? "" : groupAmount(String(f.liters).replace(".", ",")));
  };
  const cancel = () => setEditId(null);
  const save = () => {
    const v = parseAmount(editAmount);
    if (v === null || v <= 0) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) return;
    const l = editLiters.trim() === "" ? null : parseAmount(editLiters);
    if (editLiters.trim() !== "" && (l === null || l <= 0)) return;
    if (editId) onEdit(editId, v, editDate, l);
    setEditId(null);
  };

  const sorted = fuels
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
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

  const perLiter = (f: Fuel) => (f.liters && f.liters > 0 ? f.amount / f.liters : null);

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

      <section className="od-panel">
        <div className="od-panel-head">
          <div className="od-panel-title">Záznamy tankování</div>
          {sorted.length > 0 && (
            <button className="od-add" onClick={onAddClick}>
              <Plus size={16} /> Přidat tankování
            </button>
          )}
        </div>
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
                          const editing = editId === f.id;
                          const amt = editing ? parseAmount(editAmount) || 0 : f.amount;
                          const pl = editing
                            ? (() => {
                                const l = parseAmount(editLiters);
                                return l && l > 0 ? amt / l : null;
                              })()
                            : perLiter(f);
                          return (
                            <tr key={f.id}>
                              <td className="faint mono">{i + 1}</td>
                              <td className="mono">
                                {editing ? (
                                  <input
                                    className="od-inline od-inline-date"
                                    type="date"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") save();
                                      if (e.key === "Escape") cancel();
                                    }}
                                  />
                                ) : (
                                  dateLabel(f.date)
                                )}
                              </td>
                              <td className="r mono strong">
                                {editing ? (
                                  <input
                                    className="od-inline"
                                    autoFocus
                                    type="text"
                                    inputMode="decimal"
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(groupAmount(e.target.value))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") save();
                                      if (e.key === "Escape") cancel();
                                    }}
                                  />
                                ) : (
                                  czk(f.amount)
                                )}
                              </td>
                              <td className="r mono">
                                {editing ? (
                                  <input
                                    className="od-inline"
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="–"
                                    value={editLiters}
                                    onChange={(e) => setEditLiters(groupAmount(e.target.value))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") save();
                                      if (e.key === "Escape") cancel();
                                    }}
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
                                <div className="od-row-acts">
                                  {editing ? (
                                    <>
                                      <button className="od-row-btn save" onClick={save} title="Uložit">
                                        <Check size={15} />
                                      </button>
                                      <button className="od-row-btn" onClick={cancel} title="Zrušit">
                                        <X size={15} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button className="od-row-btn" onClick={() => start(f)} title="Upravit">
                                        <Pencil size={14} />
                                      </button>
                                      <button className="od-del" onClick={() => onRequestDelete(f)} title="Smazat">
                                        <Trash size={14} />
                                      </button>
                                    </>
                                  )}
                                </div>
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
      </section>
    </div>
  );
}
