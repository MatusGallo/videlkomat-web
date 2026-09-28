import { useState } from "react";
import { isISODate, parseAmount, toInputAmount } from "../utils/format";

// Cokoli s částkou a datem – zásah i tankování.
export type Editable = { id: string; amount: number; date: string };

export type RowEdit<T extends Editable = Editable> = {
  editId: string | null;
  editVal: string;
  editDate: string;
  setEditVal: (v: string) => void;
  setEditDate: (d: string) => void;
  start: (e: T) => void;
  save: () => void;
  cancel: () => void;
};

// `onEdit` může vrátit false (např. neplatné doplňkové pole) – řádek pak zůstane v editaci.
// `onStart` umožní naplnit doplňková pole (např. litry u tankování).
export function useRowEdit<T extends Editable = Editable>(
  onEdit: (id: string, amount: number, date: string) => boolean | void,
  onStart?: (e: T) => void,
): RowEdit<T> {
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editDate, setEditDate] = useState("");
  const start = (e: T) => {
    setEditId(e.id);
    setEditVal(toInputAmount(e.amount));
    setEditDate(e.date);
    onStart?.(e);
  };
  const cancel = () => setEditId(null);
  const save = () => {
    const v = parseAmount(editVal);
    if (v === null || v <= 0) return;
    if (!isISODate(editDate)) return;
    if (editId && onEdit(editId, v, editDate) === false) return;
    setEditId(null);
  };
  return { editId, editVal, editDate, setEditVal, setEditDate, start, save, cancel };
}
