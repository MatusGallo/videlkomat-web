import { useState } from "react";
import { MONTHS } from "../constants";
import { czk, dateLabel } from "../utils/format";
import { periodOf } from "../utils/stats";
import { AlertTriangle } from "../icons";
import { useSheetDrag } from "../hooks/useSheetDrag";

type Props = {
  entry: { date: string; amount: number } | null;
  noun?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({ entry, noun = "zásah", onConfirm, onCancel }: Props) {
  const sheet = useSheetDrag(onCancel, entry !== null);
  // Během odchodu už je entry null – text si podržíme, ať se neprázdní pod rukama.
  const [shown, setShown] = useState(entry);
  if (entry && entry !== shown) setShown(entry);
  if (!sheet.mounted || !shown) return null;
  return (
    <div className={sheet.wrapClass} onClick={onCancel}>
      <div className="od-modal" onClick={(e) => e.stopPropagation()} style={sheet.style} {...sheet.handlers}>
        <div className="od-modal-ico">
          <AlertTriangle size={22} />
        </div>
        <h3>Smazat {noun}?</h3>
        <p>
          {dateLabel(shown.date)} · {MONTHS[periodOf(shown.date).m]} · <b>{czk(shown.amount)}</b>
          <br />
          Tuto akci nelze vrátit zpět.
        </p>
        <div className="od-modal-acts">
          <button className="od-modal-cancel" onClick={onCancel}>Zrušit</button>
          <button className="od-modal-del" onClick={onConfirm}>Smazat</button>
        </div>
      </div>
    </div>
  );
}
