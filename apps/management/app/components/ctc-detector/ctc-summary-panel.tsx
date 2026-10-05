import { cn } from "@canny_ecosystem/ui/utils/cn";
import type { CTCCalculationResult } from "./types";

interface SummaryRowProps {
  label: string;
  value: number;
  className?: string;
  sublabel?: string;
}

function SummaryRow({ label, value, className, sublabel }: SummaryRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 px-1 border-b border-border/50 last:border-0",
        className,
      )}
    >
      <div>
        <span className="text-xs text-muted-foreground">{label}</span>
        {sublabel && (
          <span className="block text-[10px] text-muted-foreground/60">
            {sublabel}
          </span>
        )}
      </div>
      <span className="text-sm tabular-nums font-semibold">
        ₹
        {value.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    </div>
  );
}

interface CTCSummaryPanelProps {
  result: CTCCalculationResult;
}

export function CTCSummaryPanel({ result }: CTCSummaryPanelProps) {
  return (
    <div className="sticky top-4 rounded border bg-card text-card-foreground shadow overflow-hidden">
      <div className="px-5 py-4 border-b bg-primary/5">
        <h2 className="font-semibold text-base tracking-tight">
          Live Calculation Summary
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Updates in real-time as you edit
        </p>
      </div>

      <div className="px-5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mt-3 mb-1">
          Earnings
        </p>
        <SummaryRow label="Effective Basic" value={result.effectiveBasic} />
        {result.effectiveEarnings.map((e) => (
          <SummaryRow key={e.id} label={e.name || "Earning"} value={e.amount} />
        ))}
        {result.effectivePercentageComponents.map((pc) => (
          <SummaryRow
            key={pc.id}
            label={pc.name || "% Component"}
            value={pc.amount}
          />
        ))}
        <SummaryRow
          label="Total Earnings"
          value={result.totalEarnings}
          className="border-t border-border mt-1 pt-2 font-medium"
        />

        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mt-4 mb-1">
          Statutory (Employer)
        </p>
        <SummaryRow
          label="PF Wages"
          value={result.pfWages}
          sublabel={
            result.pfWages === 0
              ? "PF disabled or no PF-eligible component"
              : undefined
          }
        />
        <SummaryRow label="PF Amount" value={result.pfAmount} />
        <SummaryRow
          label="ESIC Wages"
          value={result.esicWages}
          sublabel={
            result.esicWages === 0
              ? "ESIC disabled or no ESIC-eligible component"
              : undefined
          }
        />
        <SummaryRow label="ESIC Amount" value={result.esicAmount} />
        <SummaryRow label="PTAX" value={result.ptax} />
        <SummaryRow
          label="Employer Contributions"
          value={result.employerContributions}
          className="border-t border-border mt-1 pt-2"
        />

        <div className="mt-4 mb-3 rounded border border-primary/20 bg-primary/5 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Final CTC
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Total Earnings + Employer Contributions
              </p>
            </div>
            <p className="text-xl font-bold text-primary tabular-nums">
              ₹
              {result.finalCTC.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="border-t border-primary/20 pt-2.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Basic % on CTC
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Effective Basic ÷ Final CTC × 100
              </p>
            </div>
            <p className="text-lg font-bold text-primary tabular-nums">
              {result.basicPercentage}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
