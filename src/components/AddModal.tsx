import { useEffect, useRef, useState } from "react";
import { PROFIT_RATE, PROFIT_PCT, FUEL_COST_RATE, FUEL_COST_PCT } from "../constants";
import { czk, groupAmount, num1, parseAmount, todayISO } from "../utils/format";
import { Plus, X, Check } from "../icons";
import { DateField } from "./DateField";
import { useSheetDrag } from "../hooks/useSheetDrag";

type Mode = "entry" | "fuel";

type Props = {
  open: boolean;
  initialMode: Mode;
  onClose: () => void;
  onAddEntry: (m: number, date: string, amount: number) => void;
  onAddFuel: (m: number, date: string, amount: number, liters: number | null) => void;
};

// Na dotykovém zařízení nechceme autofocus – vysunul by klávesnici hned při
// otevření sheetu a překryl formulář. Na desktopu (zkratky N/T) focus chceme.
const isTouch = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;

// Jeden „Přidat" sheet s přepínačem Zásah / Tankování.
export function AddModal({ open, initialMode, onClose, onAddEntry, onAddFuel }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [liters, setLiters] = useState("");
  const [err, setErr] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<number | null>(null);
  const sheet = useSheetDrag(onClose, open);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setDate(todayISO());
      setAmount("");
      setLiters("");
      setErr("");
      setJustAdded(null);
      if (!isTouch()) requestAnimationFrame(() => inputRef.current?.focus());
      return () => {
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
      };
    }
  }, [open, initialMode]);

  // Scroll pod sheetem držíme zamknutý, dokud je sheet v DOMu – tedy i po dobu
  // odchodové animace, jinak by se stránka vzadu na chvilku rozjela.
  useEffect(() => {
    if (!sheet.mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet.mounted]);

  // Po zavření zůstane sheet ještě chvíli v DOMu, aby stihl odejít.
  if (!sheet.mounted) return null;
  const isFuel = mode === "fuel";
  const previewAmount = parseAmount(amount);
  const previewLiters = parseAmount(liters);
  const perLiter =
    previewAmount && previewLiters && previewLiters > 0 ? previewAmount / previewLiters : null;

  const switchMode = (m: Mode) => {
    setMode(m);
    setErr("");
    if (!isTouch()) requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = () => {
    const v = parseAmount(amount);
    if (v === null || v <= 0) {
      setErr(isFuel ? "Zadej natankovanou sumu větší než 0." : "Zadej částku větší než 0.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErr("Neplatné datum.");
      return;
    }
    const l = parseAmount(liters);
    if (isFuel && liters.trim() !== "" && (l === null || l <= 0)) {
      setErr("Litry musí být kladné číslo, nebo nech pole prázdné.");
      return;
    }
    const m = parseInt(date.slice(5, 7), 10) - 1;
    if (isFuel) onAddFuel(m, date, v, liters.trim() === "" ? null : l);
    else onAddEntry(m, date, v);

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
    <div className={sheet.wrapClass} onClick={onClose}>
      <div
        className="od-modal od-modal-wide"
        onClick={(e) => e.stopPropagation()}
        style={sheet.style}
        {...sheet.handlers}
      >
        <div className="od-modal-head">
          <h3>Přidat</h3>
          <button className="od-row-btn" onClick={onClose} title="Zavřít">
            <X size={15} />
          </button>
        </div>

        <div className="od-switch od-switch-add" role="tablist" aria-label="Typ záznamu">
          <button
            role="tab"
            aria-selected={!isFuel}
            className={"od-switch-btn" + (!isFuel ? " is-active" : "")}
            onClick={() => switchMode("entry")}
          >
            Zásah
          </button>
          <button
            role="tab"
            aria-selected={isFuel}
            className={"od-switch-btn" + (isFuel ? " is-active" : "")}
            onClick={() => switchMode("fuel")}
          >
            Tankování
          </button>
        </div>

        <p className="od-modal-sub">
          {isFuel
            ? "Datum určuje měsíc i rok záznamu. Litry jsou nepovinné."
            : "Datum určuje měsíc i rok záznamu."}
        </p>

        <div className="od-form od-form-stack">
          <div className="od-field">
            <label>Datum</label>
            <DateField value={date} onChange={setDate} />
          </div>
          <div className="od-field">
            <label>{isFuel ? "Natankováno" : "Částka"}</label>
            <div className="od-input-wrap">
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                placeholder={isFuel ? "např. 2 000" : "např. 3 500"}
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

          {isFuel && (
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
          )}

          {err && (
            <div className="od-err-box">
              <span className="od-err-ico" aria-hidden="true">!</span>
              {err}
            </div>
          )}

          {isFuel ? (
            <>
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
            </>
          ) : (
            <div className="od-profit-readout">
              <span className="od-profit-label">Zisk {PROFIT_PCT} %</span>
              <span className="od-profit-val mono">
                {previewAmount ? czk(previewAmount * PROFIT_RATE) : "–"}
              </span>
            </div>
          )}

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
