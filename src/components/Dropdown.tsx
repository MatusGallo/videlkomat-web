import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "../icons";

type Option = { value: number; label: string };

type Props = {
  value: number;
  options: Option[];
  onChange: (value: number) => void;
  ariaLabel?: string;
  className?: string;
};

export function Dropdown({ value, options, onChange, ariaLabel, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={"od-dd" + (className ? " " + className : "")} ref={ref}>
      <button
        type="button"
        className={"od-dd-trigger" + (open ? " is-open" : "")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="od-dd-val">{current?.label ?? ""}</span>
        <ChevronDown size={16} className="od-dd-chev" />
      </button>
      {open && (
        <ul className="od-dd-menu" role="listbox">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={"od-dd-opt" + (o.value === value ? " is-sel" : "")}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={15} className="od-dd-check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
