import type { Entry } from "../types";
import type { RowEdit } from "../hooks/useRowEdit";
import { Check, X, Pencil, Trash } from "../icons";
import { groupAmount } from "../utils/format";

export function AmountInput({ ed }: { ed: RowEdit }) {
  return (
    <input
      className="od-inline"
      autoFocus
      type="text"
      inputMode="decimal"
      value={ed.editVal}
      onChange={(e) => ed.setEditVal(groupAmount(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") ed.save();
        if (e.key === "Escape") ed.cancel();
      }}
    />
  );
}

export function DateInput({ ed }: { ed: RowEdit }) {
  return (
    <input
      className="od-inline od-inline-date"
      type="date"
      value={ed.editDate}
      onChange={(e) => ed.setEditDate(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") ed.save();
        if (e.key === "Escape") ed.cancel();
      }}
    />
  );
}

type RowActionsProps = {
  e: Entry;
  ed: RowEdit;
  onRequestDelete: (entry: Entry) => void;
};

export function RowActions({ e, ed, onRequestDelete }: RowActionsProps) {
  if (ed.editId === e.id) {
    return (
      <div className="od-row-acts">
        <button className="od-row-btn save" onClick={ed.save} title="Uložit">
          <Check size={15} />
        </button>
        <button className="od-row-btn" onClick={ed.cancel} title="Zrušit">
          <X size={15} />
        </button>
      </div>
    );
  }
  return (
    <div className="od-row-acts">
      <button className="od-row-btn" onClick={() => ed.start(e)} title="Upravit">
        <Pencil size={14} />
      </button>
      <button className="od-del" onClick={() => onRequestDelete(e)} title="Smazat">
        <Trash size={14} />
      </button>
    </div>
  );
}
