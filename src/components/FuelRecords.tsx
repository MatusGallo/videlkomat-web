import type { Fuel } from "../types";
import { FUEL_COST_RATE, FUEL_COST_PCT, FUEL_RECORDS_LIMIT } from "../constants";
import { byDateDesc, czk, dateLabel, parseAmount } from "../utils/format";
import { useRowEdit } from "../hooks/useRowEdit";
import { AmountInput, DateInput, RowActions } from "./RowActions";

type Props = {
  fuels: Fuel[];
  onEdit: (id: string, amount: number, date: string, liters: number | null) => void;
  onRequestDelete: (fuel: Fuel) => void;
};

// Kompaktní, editovatelný seznam tankování vedle záznamů zásahů na dashboardu.
// Litry se tu needitují (na to je stránka Tankování) – při uložení se zachovají.
export function FuelRecords({ fuels, onEdit, onRequestDelete }: Props) {
  const ed = useRowEdit<Fuel>((id, amount, date) =>
    onEdit(id, amount, date, fuels.find((f) => f.id === id)?.liters ?? null),
  );
  const visible = fuels.slice().sort(byDateDesc).slice(0, FUEL_RECORDS_LIMIT);

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
            const editing = ed.editId === f.id;
            const amt = editing ? parseAmount(ed.editVal) || 0 : f.amount;
            return (
              <tr key={f.id}>
                <td className="mono">{editing ? <DateInput ed={ed} /> : dateLabel(f.date)}</td>
                <td className="r mono strong">{editing ? <AmountInput ed={ed} /> : czk(f.amount)}</td>
                <td className="r mono cost">− {czk(amt * FUEL_COST_RATE)}</td>
                <td className="r">
                  <RowActions e={f} ed={ed} onRequestDelete={onRequestDelete} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
