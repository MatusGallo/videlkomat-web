import type { InputHTMLAttributes } from "react";
import type { Editable, RowEdit } from "../hooks/useRowEdit";
import { Check, X, Pencil, Trash } from "../icons";
import { groupAmount } from "../utils/format";

type InlineInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  onValue: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

// Inline input v řádku tabulky: Enter uloží, Escape zruší.
export function InlineInput({ onValue, onSave, onCancel, className, ...rest }: InlineInputProps) {
  return (
    <input
      className={"od-inline" + (className ? " " + className : "")}
      {...rest}
      onChange={(e) => onValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave();
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

export function AmountInput<T extends Editable>({ ed }: { ed: RowEdit<T> }) {
  return (
    <InlineInput
      autoFocus
      type="text"
      inputMode="decimal"
      value={ed.editVal}
      onValue={(v) => ed.setEditVal(groupAmount(v))}
      onSave={ed.save}
      onCancel={ed.cancel}
    />
  );
}

export function DateInput<T extends Editable>({ ed }: { ed: RowEdit<T> }) {
  return (
    <InlineInput
      className="od-inline-date"
      type="date"
      value={ed.editDate}
      onValue={ed.setEditDate}
      onSave={ed.save}
      onCancel={ed.cancel}
    />
  );
}

type RowActionsProps<T extends Editable> = {
  e: T;
  ed: RowEdit<T>;
  onRequestDelete: (entry: T) => void;
};

export function RowActions<T extends Editable>({ e, ed, onRequestDelete }: RowActionsProps<T>) {
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
