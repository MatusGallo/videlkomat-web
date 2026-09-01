import type { ReactNode } from "react";
import type { MoMChange } from "../types";
import { ArrowUpRight, ArrowDownRight } from "../icons";
import { num1 } from "../utils/format";

type Props = {
  label: string;
  value: string;
  unit?: string;
  icon?: ReactNode;
  change?: MoMChange;
  changeLabel?: string;
  accent?: boolean;
  foot?: string;
  extraFoot?: string;
};

export function Kpi({ label, value, unit, icon, change, changeLabel = "vs. minulý měsíc", accent, foot, extraFoot }: Props) {
  return (
    <div className={"od-kpi" + (accent ? " is-accent" : "")}>
      <div className="od-kpi-top">
        <div className="od-kpi-lead">
          {icon && <span className="od-kpi-ico">{icon}</span>}
          <span className="od-kpi-label">{label}</span>
        </div>
      </div>
      <div className="od-kpi-val mono">
        {value} {unit && <em>{unit}</em>}
      </div>
      <div className="od-kpi-foot">
        {foot ? (
          <span className="flat">{foot}</span>
        ) : change ? (
          <span className="od-kpi-change">
            <span className={"od-chip " + (change.up ? "up" : "down")}>
              {change.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {num1(Math.abs(change.pct))} %
            </span>
            <em>{changeLabel}</em>
          </span>
        ) : (
          <span className="flat">
            <ArrowUpRight size={14} /> <em>málo dat pro srovnání</em>
          </span>
        )}
        {extraFoot && <div className="od-kpi-extra mono">{extraFoot}</div>}
      </div>
    </div>
  );
}
