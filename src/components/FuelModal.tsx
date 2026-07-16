import { useEffect, useRef, useState } from "react";
import { FUEL_COST_RATE, FUEL_COST_PCT } from "../constants";
import { czk, groupAmount, num1, parseAmount, todayISO } from "../utils/format";
import { Plus, X, Check } from "../icons";
import { DateField } from "./DateField";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (m: number, date: string, amount: number, liters: number | null) => void;
};

export function FuelModal({ open, onClose, onAdd }: Props) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [err, setErr] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setDate(todayISO());
      setAmount("");
      setLiters("");
      setErr("");
      setJustAdded(null);
      requestAnimationFrame(() => inputRef.current?.focus());
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
      };
    }
  }, [open]);

  if (!open) return null;
  const previewAmount = parseAmount(amount);
  const previewLiters = parseAmount(liters);
  const perLiter =
    previewAmount && previewLiters && previewLiters > 0 ? previewAmount / previewLiters : null;

  const submit = () => {
    const v = parseAmount(amount);
    if (v === null || v <= 0) {
      setErr("Zadej natankovanou sumu větší než 0.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErr("Neplatné datum.");
      return;
    }
    const l = parseAmount(liters);
    if (liters.trim() !== "" && (l === null || l <= 0)) {
      setErr("Litry musí být kladné číslo, nebo nech pole prázdné.");
      return;
    }
    const m = parseInt(date.slice(5, 7), 10) - 1;
    onAdd(m, date, v, liters.trim() === "" ? null : l);

    if (keepOpen) {
      setJustAdded(czk(v));
      setAmount("");
      setLiters("");
      setErr("");
      requestAnimationFrame(() => inputRef.current?.focus());
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setJustAdded(null), 1800);
    } else {
      onClose();
    }
  };

  return (
    <div className="od-modal-wrap" onClick={onClose}>
      <div className="od-modal od-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="od-modal-head">
          <h3>Nové tankování</h3>
          <button className="od-row-btn" onClick={onClose} title="Zavřít">
            <X size={15} />
          </button>
        </div>
        <p className="od-modal-sub">Datum určuje měsíc i rok záznamu. Litry jsou nepovinné.</p>
        <div className="od-form od-form-stack">
          <div className="od-field">
            <label>Datum</label>
            <DateField value={date} onChange={setDate} />
          </div>
          <div className="od-field">
            <label>Natankováno</label>
            <div className="od-input-wrap">
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                placeholder="např. 2 000"
                value={amount}
                aria-invalid={!!err}
                onChange={(e) => {
                  setAmount(groupAmount(e.target.value));
                  if (err) setErr("");
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <span className="od-input-suffix">Kč</span>
            </div>
          </div>
          <div className="od-field">
            <label>Litry <span className="od-label-opt">(nepovinné)</span></label>
            <div className="od-input-wrap">
              <input
                type="text"
                inputMode="decimal"
                placeholder="např. 35,4"
                value={liters}
                onChange={(e) => {
                  setLiters(groupAmount(e.target.value));
                  if (err) setErr("");
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <span className="od-input-suffix">L</span>
            </div>
          </div>
          {err && (
            <div className="od-err-box">
              <span className="od-err-ico" aria-hidden="true">!</span>
              {err}
            </div>
          )}
          <div className="od-profit-readout">
            <span className="od-profit-label">Můj náklad {FUEL_COST_PCT} %</span>
            <span className="od-profit-val mono">
              {previewAmount ? czk(previewAmount * FUEL_COST_RATE) : "–"}
            </span>
          </div>
          <div className="od-profit-readout">
            <span className="od-profit-label">Cena za litr</span>
            <span className="od-profit-val mono">{perLiter ? `${num1(perLiter)} Kč/L` : "–"}</span>
          </div>
          <label className="od-check">
            <input
              type="checkbox"
              checked={keepOpen}
              onChange={(e) => setKeepOpen(e.target.checked)}
            />
            <span className="od-check-box" aria-hidden="true">
              {keepOpen && <Check size={13} />}
            </span>
            <span>Po přidání nezavírat (přidat více záznamů)</span>
          </label>
          {justAdded && (
            <div className="od-add-flash">
              <Check size={15} /> Přidáno {justAdded}
            </div>
          )}
        </div>
        <div className="od-modal-acts">
          <button className="od-modal-cancel" onClick={onClose}>
            {keepOpen ? "Hotovo" : "Zrušit"}
          </button>
          <button className="od-add" onClick={submit}>
            <Plus size={16} /> Přidat
          </button>
        </div>
      </div>
    </div>
  );
}
