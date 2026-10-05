import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@canny_ecosystem/ui/alert-dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { resolveDynamicDate } from "@canny_ecosystem/utils";
import { cn } from "@canny_ecosystem/ui/utils/cn";

interface FormulaItem {
  id: string;
  label: string;
  baseKey: string;
  formula: string;
}

const INITIAL_FORMULAS: FormulaItem[] = [
  {
    id: "0",
    label: "Joining Date (Ordinal Format, e.g. 1st Sep 2026)",
    baseKey: "joinedDate",
    formula: "ordinal",
  },
  {
    id: "1",
    label: "Joining Date + 1 Year",
    baseKey: "joinedDate",
    formula: "add:1:year",
  },
  {
    id: "2",
    label: "Joining Date + 6 Months - 1 Day",
    baseKey: "joinedDate",
    formula: "add:6:month-1:day",
  },
  {
    id: "3",
    label: "Joining Date + 1 Year (Ordinal Format)",
    baseKey: "joinedDate",
    formula: "add:1:year|ordinal",
  },
  {
    id: "4",
    label: "Today Date + 15 Days - 1 Day",
    baseKey: "todayDate",
    formula: "add:15:day-1:day",
  },
  {
    id: "5",
    label: "Exit Date - 1 Month",
    baseKey: "exitDate",
    formula: "sub:1:month",
  },
];

export function FormulaDebuggerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const [testDate, setTestDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );

  const [formulas, setFormulas] = useState<FormulaItem[]>(INITIAL_FORMULAS);

  const [customBaseKey, setCustomBaseKey] = useState("joinedDate");
  const [customFormula, setCustomFormula] = useState("add:6:month-1:day");

  const handleUpdateFormula = (id: string, newFormula: string) => {
    setFormulas((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, formula: newFormula } : item,
      ),
    );
  };

  const handleCopyTag = (baseKey: string, formulaStr: string) => {
    const fullTag = `\${${baseKey}|${formulaStr}}`;
    navigator.clipboard.writeText(fullTag);
    toast({
      title: "Copied!",
      description: `Copied ${fullTag} to clipboard.`,
      variant: "success",
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[760px] p-6 bg-background border rounded-lg shadow-2xl overflow-y-auto max-h-[90vh] transition-all duration-300">
        <AlertDialogHeader className="space-y-1.5 pb-4 border-b">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-md text-primary">
              <Icon name="calendar" className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-xl font-bold tracking-tight">
              Formula Debugger
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Test and debug your dynamic date formulas in real-time. Change the
            test date below or type custom formulas to see how they resolve.
            Click any tag to copy it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-5 p-4 bg-muted/30 border rounded-lg flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="space-y-0.5">
            <h4 className="text-sm font-semibold text-foreground">
              Global Test Date
            </h4>
            <p className="text-xs text-muted-foreground">
              This date will be passed as the base date to all active formulas
              below.
            </p>
          </div>
          <input
            type="date"
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
            className="w-full sm:w-[180px] bg-background border rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Example Formulas & Debugger
          </h4>

          <div className="border rounded-lg overflow-hidden bg-card divide-y">
            {formulas.map((item) => {
              const resolvedValue = resolveDynamicDate(testDate, item.formula);
              const isValid = resolvedValue && resolvedValue !== "";

              return (
                <div
                  key={item.id}
                  className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between hover:bg-muted/10 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground block">
                      {item.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyTag(item.baseKey, item.formula)}
                      className="group inline-flex items-center gap-1.5 px-2 py-0.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded font-mono text-xs border transition-colors cursor-pointer"
                      title="Click to copy full tag"
                    >
                      <span>
                        ${"{"}
                        {item.baseKey}|{item.formula}
                        {"}"}
                      </span>
                      <Icon
                        name="plus-circled"
                        className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors"
                      />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pl-1">
                        Formula String
                      </span>
                      <input
                        type="text"
                        value={item.formula}
                        onChange={(e) =>
                          handleUpdateFormula(item.id, e.target.value)
                        }
                        className="bg-background border rounded px-2 py-1 text-xs font-mono w-[180px] focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>

                    <div className="flex flex-col gap-0.5 min-w-[110px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pl-1">
                        Result Output
                      </span>
                      <div
                        className={cn(
                          "px-2.5 py-1 text-xs font-semibold rounded border text-center font-mono leading-tight",
                          isValid
                            ? "bg-success/10 text-success border-success/30"
                            : "bg-destructive/10 text-destructive border-destructive/30",
                        )}
                      >
                        {isValid ? resolvedValue : "Invalid Formula"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 p-4 border rounded-lg bg-primary/5 border-primary/20 space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="rupees" className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-bold text-primary">
              Custom Formula Scratchpad
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Base Date Placeholder
              </label>
              <select
                value={customBaseKey}
                onChange={(e) => setCustomBaseKey(e.target.value)}
                className="w-full bg-background border rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="joinedDate">joinedDate (Joining Date - dd/MM/yyyy)</option>
                <option value="joinedDateOrdinal">joinedDateOrdinal (1st Sep 2026)</option>
                <option value="todayDate">todayDate (Today Date)</option>
                <option value="exitDate">exitDate (Exit Date)</option>
                <option value="resignationDate">
                  resignationDate (Resignation Date)
                </option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Custom Formula
              </label>
              <input
                type="text"
                placeholder="e.g. add:6:month-1:day or ordinal"
                value={customFormula}
                onChange={(e) => setCustomFormula(e.target.value)}
                className="w-full bg-background border rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Live Resolution
              </label>
              <div className="flex gap-2">
                <div
                  className={cn(
                    "flex-1 px-2.5 py-1.5 text-xs font-semibold rounded border text-center font-mono flex items-center justify-center",
                    resolveDynamicDate(testDate, customFormula)
                      ? "bg-success/10 text-success border-success/30"
                      : "bg-destructive/10 text-destructive border-destructive/30",
                  )}
                >
                  {resolveDynamicDate(testDate, customFormula) ||
                    "Invalid Formula"}
                </div>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => handleCopyTag(customBaseKey, customFormula)}
                  disabled={!resolveDynamicDate(testDate, customFormula)}
                  className="px-2"
                  title="Copy placeholder tag"
                >
                  <Icon name="plus-circled" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 border rounded-lg bg-card space-y-4">
          <div>
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-3">
              <Icon name="plus-circled" className="h-3.5 w-3.5" />
              Formula Reference & Legend
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-xs text-muted-foreground">
              <div>
                <span className="font-mono text-foreground font-semibold">
                  ordinal
                </span>
                <p className="pl-3 mt-0.5 leading-relaxed">
                  Formats as ordinal text (e.g. <span className="font-semibold text-foreground">1st Sep 2026</span>). Can be used alone or appended:{" "}
                  <span className="font-mono bg-muted/60 px-1 py-0.5 rounded">
                    ordinal
                  </span>
                  ,{" "}
                  <span className="font-mono bg-muted/60 px-1 py-0.5 rounded">
                    add:1:year|ordinal
                  </span>
                </p>
              </div>
              <div>
                <span className="font-mono text-foreground font-semibold">
                  add:N:unit
                </span>
                <p className="pl-3 mt-0.5 leading-relaxed">
                  Adds <span className="font-semibold text-foreground">N</span>{" "}
                  years, months, or days. Examples:{" "}
                  <span className="font-mono bg-muted/60 px-1 py-0.5 rounded">
                    add:1:year
                  </span>
                  ,{" "}
                  <span className="font-mono bg-muted/60 px-1 py-0.5 rounded">
                    add:15:day
                  </span>
                </p>
              </div>
              <div>
                <span className="font-mono text-foreground font-semibold">
                  sub:N:unit
                </span>
                <p className="pl-3 mt-0.5 leading-relaxed">
                  Subtracts{" "}
                  <span className="font-semibold text-foreground">N</span>{" "}
                  years, months, or days. Examples:{" "}
                  <span className="font-mono bg-muted/60 px-1 py-0.5 rounded">
                    sub:1:month
                  </span>
                </p>
              </div>
              <div>
                <span className="font-mono text-foreground font-semibold">
                  -[N]:day / +[N]:day
                </span>
                <p className="pl-3 mt-0.5 leading-relaxed">
                  Appended suffix to add/subtract final days. Examples:{" "}
                  <span className="font-mono bg-muted/60 px-1 py-0.5 rounded">
                    add:6:month-1:day
                  </span>
                </p>
              </div>
              <div>
                <span className="font-mono text-foreground font-semibold">
                  -round
                </span>
                <p className="pl-3 mt-0.5 leading-relaxed">
                  Appended suffix to round back to previous month's end.
                  Examples:{" "}
                  <span className="font-mono bg-muted/60 px-1 py-0.5 rounded">
                    add:6:month-round
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Icon
                name="check"
                className="h-3.5 w-3.5 text-primary animate-bounce"
              />
              Signature Custom Suffix Reference
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-xs text-muted-foreground">
              <div>
                <span className="font-mono text-foreground font-semibold">
                  {"${signature}"}
                </span>
                <p className="pl-3 mt-0.5 leading-relaxed">
                  Default: Renders everything (Yours truly, Company Name,
                  Director & Signature image).
                </p>
              </div>
              <div>
                <span className="font-mono text-foreground font-semibold">
                  {"${signature:0}"}
                </span>
                <p className="pl-3 mt-0.5 leading-relaxed">
                  Renders only{" "}
                  <span className="font-semibold text-foreground">
                    Yours truly
                  </span>{" "}
                  & Canny Management Services name block.
                </p>
              </div>
              <div>
                <span className="font-mono text-foreground font-semibold">
                  {"${signature:0:1}"}
                </span>
                <p className="pl-3 mt-0.5 leading-relaxed">
                  Renders Yours truly, Company Name &{" "}
                  <span className="font-semibold text-foreground">
                    Signature image
                  </span>
                  .
                </p>
              </div>
              <div>
                <span className="font-mono text-foreground font-semibold">
                  {"${signature:0:1:2}"} (or simply {"${signature:0:2}"})
                </span>
                <p className="pl-3 mt-0.5 leading-relaxed">
                  Renders Yours truly, Company Name, Signature (if :1 included)
                  &{" "}
                  <span className="font-semibold text-foreground">
                    Director
                  </span>{" "}
                  title.
                </p>
              </div>
            </div>
          </div>
        </div>

        <AlertDialogFooter className="mt-6 pt-4 border-t">
          <AlertDialogCancel className="w-full sm:w-auto">
            Close Debugger
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
