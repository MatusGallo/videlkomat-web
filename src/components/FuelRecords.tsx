import { useState } from "react";
import type { Fuel } from "../types";
import { FUEL_COST_RATE, FUEL_COST_PCT } from "../constants";
import { czk, dateLabel, groupAmount, parseAmount } from "../utils/format";
import { Check, X, Pencil, Trash } from "../icons";

type Props = {
  fuels: Fuel[];
  limit?: number;
  onEdit: (id: string, amount: number, date: string, liters: number | null) => void;
  onRequestDelete: (fuel: Fuel) => void;
};

// Kompaktní, editovatelný seznam tankování vedle záznamů zásahů na dashboardu.
// Litry se tu needitují (na to je stránka Tankování) – při uložení se zachovají.
export function FuelRecords({ fuels, limit = 10, onEdit, onRequestDelete }: Props) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");

  const sorted = fuels
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const visible = sorted.slice(0, limit);

  const start = (f: Fuel) => {
    setEditId(f.id);
    setEditAmount(groupAmount(String(f.amount).replace(".", ",")));
    setEditDate(f.date);
  };
  const cancel = () => setEditId(null);
  const save = (f: Fuel) => {
    const v = parseAmount(editAmount);
    if (v === null || v <= 0) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) return;
    onEdit(f.id, v, editDate, f.liters ?? null);
    setEditId(null);
  };

  return (
    <div className="od-table-wrap">
      <table className="od-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th className="r">Natankováno</th>
            <th className="r">Náklad {FUEL_COST_PCT} %</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((f) => {
            const editing = editId === f.id;
            const amt = editing ? parseAmount(editAmount) || 0 : f.amount;
            return (
              <tr key={f.id}>
                <td className="mono">
                  {editing ? (
                    <input
                      className="od-inline od-inline-date"
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") save(f);
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
                        if (e.key === "Enter") save(f);
                        if (e.key === "Escape") cancel();
                      }}
                    />
                  ) : (
                    czk(f.amount)
                  )}
                </td>
                <td className="r mono cost">− {czk(amt * FUEL_COST_RATE)}</td>
                <td className="r">
                  <div className="od-row-acts">
                    {editing ? (
                      <>
                        <button className="od-row-btn save" onClick={() => save(f)} title="Uložit">
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
  );
}
