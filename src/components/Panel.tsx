import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  icon?: ReactNode;
  sub?: ReactNode;
  tools?: ReactNode;
  /** Bez vnitřní plochy – obsah si nese vlastní karty (např. záznamy po dnech). */
  bare?: boolean;
  className?: string;
  children: ReactNode;
};

/* Dvouvrstvá karta: vnější rám s hlavičkou (štítek + nástroje) a vnitřní
   „vybraná" plocha s obsahem. Stejná stavba jako Kpi. */
export function Panel({ title, icon, sub, tools, bare, className, children }: Props) {
  return (
    <section className={"od-panel" + (bare ? " is-bare" : "") + (className ? " " + className : "")}>
      <div className="od-panel-head">
        <div className="od-panel-titles">
          <div className="od-panel-title">
            {icon && <span className="od-panel-ico">{icon}</span>}
            {title}
          </div>
          {sub && <span className="od-panel-sub">{sub}</span>}
        </div>
        {tools && <div className="od-panel-tools">{tools}</div>}
      </div>
      <div className="od-panel-body">{children}</div>
    </section>
  );
}
