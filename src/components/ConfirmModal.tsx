import { useState } from "react";
import { MONTHS } from "../constants";
import { czk, dateLabel } from "../utils/format";
import { periodOf } from "../utils/stats";
import { AlertTriangle } from "../icons";
import { useSheetDrag } from "../hooks/useSheetDrag";

type Props = {
  entry: { date: string; amount: number } | null;
  noun?: string;
  // Vlastní popis položky místo „datum · měsíc · částka" (např. u výjezdu).
  detail?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({ entry, noun = "zásah", detail, onConfirm, onCancel }: Props) {
  const sheet = useSheetDrag(onCancel, entry !== null);
  // Během odchodu už je entry null – text si podržíme, ať se neprázdní pod rukama.
  const [shown, setShown] = useState(entry);
  const [shownDetail, setShownDetail] = useState(detail);
  if (entry && entry !== shown) setShown(entry);
  if (entry && detail !== shownDetail) setShownDetail(detail);
  if (!sheet.mounted || !shown) return null;
  return (
    <div className={sheet.wrapClass} onClick={onCancel}>
      <div className="od-modal" onClick={(e) => e.stopPropagation()} style={sheet.style} {...sheet.handlers}>
        <div className="od-modal-ico">
          <AlertTriangle size={22} />
        </div>
        <h3>Smazat {noun}?</h3>
        <p>
          {shownDetail ?? (
            <>
              {dateLabel(shown.date)} · {MONTHS[periodOf(shown.date).m]} · <b>{czk(shown.amount)}</b>
            </>
          )}
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
