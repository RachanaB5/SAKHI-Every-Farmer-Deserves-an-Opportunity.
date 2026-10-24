// Chart frame used by every dashboard: title + subtitle, optional legend
// chips (identity never by colour alone), the plot, and a "View data"
// table so every chart has a non-visual equivalent.
"use client";

import { ChevronDown } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

export interface LegendItem {
  label: string;
  color: string;
}

/**
 * @param table - rows for the accessible data view: [header, ...rows]
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  legend?: LegendItem[];
  table?: (string | number)[][];
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className={cn("rounded-3xl border bg-card p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {legend && legend.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={t("chart.legend")}>
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">{children}</div>
      {table && table.length > 1 && (
        <details className="group mt-2">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /> {t("chart.viewData")}
          </summary>
          <div className="mt-2 max-h-64 overflow-auto rounded-xl border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {table[0].map((h) => (
                    <th key={String(h)} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {table.slice(1).map((row, i) => (
                  <tr key={i}>
                    {row.map((c, j) => (
                      <td key={j} className={cn("px-3 py-1.5", j > 0 && "tabular")}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

/** Recharts tooltip body in app tokens (values in text ink, colour swatch carries identity). */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue = (v) => String(v),
  formatLabel = (l) => String(l),
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number }[];
  label?: string | number;
  formatValue?: (v: number) => string;
  formatLabel?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label !== undefined ? formatLabel(label) : ""}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="tabular ml-auto font-semibold">{typeof p.value === "number" ? formatValue(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** "2026-10-20" → "20 Oct". */
export function shortDay(iso: string | number) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
