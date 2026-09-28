import { useMemo } from "react";
import type { ModelParams } from "../../predict/types";
import { addHours, shiftPlan } from "../../predict/model";
import { DAY_SHORT, hourLabel } from "../../predict/labels";
import { ALERT_LEAD_MIN } from "../../predict/alerts";
import { num1 } from "../../utils/format";
import { Check } from "../../icons";
import { Dropdown } from "../Dropdown";

const SHIFT_LENGTHS = [4, 6, 8, 10, 12];

export type AlertsState = {
  on: boolean;
  // unsupported = prohlížeč neumí notifikace, denied = uživatel je zakázal.
  status: "ok" | "unsupported" | "denied";
  toggle: () => void;
};

type Props = {
  params: ModelParams;
  d: number;
  h: number;
  hours: number;
  onHours: (n: number) => void;
  alerts: AlertsState;
  // Minuty z mé polohy ke stanovištím (plán pak začíná odsud).
  startMove?: number[];
};

// Plán směny: kdy u kterého stanoviště stát a kolik zakázek to vynese.
export function ShiftPlan({ params, d, h, hours, onHours, alerts, startMove }: Props) {
  const plan = useMemo(() => shiftPlan(params, d, h, hours, { startMove }), [params, d, h, hours, startMove]);
  const maxBlock = Math.max(...plan.blocks.map((b) => b.expected / b.hours), 1e-9);

  return (
    <section className="od-panel">
      <div className="od-panel-head">
        <div className="od-panel-title">Plán směny</div>
        <Dropdown
          value={hours}
          options={SHIFT_LENGTHS.map((n) => ({ value: n, label: `${n} h od ${hourLabel(h)}` }))}
          onChange={onHours}
          ariaLabel="Délka směny"
        />
      </div>

      <ol className="pr-plan">
        {plan.blocks.map((b, i) => {
          const stand = params.stands[b.best];
          const [ed, eh] = addHours(b.d, b.h, b.hours);
          const dayChange = b.d !== d || ed !== b.d;
          return (
            <li key={`${b.d}-${b.h}`}>
              <span className="pr-plan-time mono">
                {dayChange && <em>{DAY_SHORT[b.d]} </em>}
                {hourLabel(b.h)}–{hourLabel(eh)}
              </span>
              <span className="pr-rank-id">{stand?.id ?? "–"}</span>
              <span className="pr-plan-main">
                <span className="pr-plan-name">
                  {(i > 0 || b.moveMinutes > 0) && <span className="pr-plan-move">{i === 0 ? "cesta" : "přesun"} {Math.round(b.moveMinutes)} min · </span>}
                  {stand?.name ?? "bez stanoviště"}
                </span>
                <span className="pr-bar">
                  <span style={{ width: `${((b.expected / b.hours) / maxBlock) * 100}%` }} />
                </span>
              </span>
              <span className="pr-plan-val mono">{num1(b.expected)}</span>
            </li>
          );
        })}
      </ol>
      <div className="pr-plan-total">
        <span>Očekávané zakázky za směnu</span>
        <b className="mono">{num1(plan.expected)}</b>
      </div>

      <label className="od-check pr-alerts">
        <input
          type="checkbox"
          checked={alerts.on}
          disabled={alerts.status !== "ok"}
          onChange={alerts.toggle}
        />
        <span className="od-check-box" aria-hidden="true">
          {alerts.on && <Check size={13} />}
        </span>
        <span>
          Upozornit {ALERT_LEAD_MIN} min před přesunem a před špičkou
          {alerts.status === "unsupported" && <em> – tento prohlížeč notifikace neumí</em>}
          {alerts.status === "denied" && <em> – notifikace jsou v prohlížeči zakázané</em>}
        </span>
      </label>
      <p className="pr-note">
        Plán počítá s dobou přesunu: přes půl Prahy se vyplatí jet, jen když tam poptávka vydrží. Upozornění chodí,
        dokud je aplikace otevřená (i na pozadí), podle aktuálního času.
      </p>
    </section>
  );
}
