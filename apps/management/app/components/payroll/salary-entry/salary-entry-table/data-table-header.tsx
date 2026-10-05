import { Button, buttonVariants } from "@canny_ecosystem/ui/button";
import { Checkbox } from "@canny_ecosystem/ui/checkbox";
import { Icon } from "@canny_ecosystem/ui/icon";
import { TableHead, TableHeader, TableRow } from "@canny_ecosystem/ui/table";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { useState, useEffect } from "react";
import { useSubmit, useLocation } from "@remix-run/react";
import { useUser } from "@/utils/user";
import { hasPermission, deleteRole } from "@canny_ecosystem/utils";
import { attribute, DELETE_TEXT } from "@canny_ecosystem/utils/constant";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@canny_ecosystem/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@canny_ecosystem/ui/alert-dialog";
import { Input } from "@canny_ecosystem/ui/input";
import { ErrorList } from "@canny_ecosystem/ui/forms";

interface Props {
  table?: any;
  loading?: boolean;
  className?: string;
  uniqueFields: { name: string; type: "earning" | "deduction"; id?: string }[];
  payrollId?: string;
  editable?: boolean;
}

export function SalaryTableHeader({
  table,
  loading,
  className,
  uniqueFields,
  payrollId,
  editable = false,
}: Props) {
  const salaryEntryColumnIdArray = [
    "sr_no",
    "employee_code",
    "name",
    "site",
    "project",
    "department",
    "working_days",
    "present_days",
    "paid_holidays",
    "paid_leaves",
    "casual_leaves",
    "overtime_hours",

    "period",
    "monthly_ctc",
    ...uniqueFields.map((field) => field.name),
    "net_amount",
  ];

  const { role } = useUser();
  const submit = useSubmit();
  const location = useLocation();

  const isEditable =
    editable && hasPermission(role, `${deleteRole}:${attribute.payroll}`);

  const [selectedField, setSelectedField] = useState<{
    id: string;
    name: string;
    type: "earning" | "deduction";
    fieldId?: string;
  } | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");
  const [deleteError, setDeleteError] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Close deleting state when location changes/action completes
  useEffect(() => {
    setIsDeleting(false);
    setDeleteConfirmValue("");
  }, [location]);

  const handleDeleteConfirm = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (deleteConfirmValue === DELETE_TEXT) {
      if (selectedField?.fieldId && payrollId) {
        setIsDeleting(true);
        submit(
          {
            fieldId: selectedField.fieldId,
          },
          {
            method: "POST",
            action: `/payroll/run-payroll/${payrollId}/delete-payroll-fields${location.search}`,
          },
        );
        setIsDeleteDialogOpen(false);
        setSelectedField(null);
      }
    } else {
      e.preventDefault();
      setDeleteError(["Please type the correct text to confirm."]);
    }
  };

  const [sortingOrder, setSortingOrder] = useState("");
  const [sortingId, setSortingId] = useState("");

  const sort = (id: string) => {
    const column = table
      ?.getAllLeafColumns()
      ?.find((col: any) => col?.columnDef.accessorKey === id);

    if (!column) return;

    if (sortingId !== id) {
      table.resetSorting();
      column.toggleSorting(false);
      setSortingOrder("asc");
      setSortingId(id);
    } else {
      if (sortingOrder === "") {
        column.toggleSorting(false);
        setSortingOrder("asc");
      } else if (sortingOrder === "asc") {
        column.toggleSorting(true);
        setSortingOrder("desc");
      } else {
        table.resetSorting();
        setSortingOrder("");
        setSortingId("");
      }
    }
  };

  const isEnableSorting = (id: string) =>
    (
      loading ||
      table?.getAllLeafColumns()?.find((col: any) => {
        return col.id === id;
      })
    )?.getCanSort();

  const columnName = (id: string) => {
    if (loading) return "";
    const rawHeader = table?.getAllLeafColumns()?.find((col: any) => {
      return col.id === id;
    })?.columnDef?.header;

    if (!rawHeader) return String(id).replace(/_/g, " ");
    if (typeof rawHeader === "string") {
      return rawHeader.replace(/_/g, " ");
    }
    return rawHeader;
  };

  return (
    <TableHeader className={className}>
      <TableRow className="min-h-[45px] h-auto bg-card">
        <TableHead className="md:table-cell px-4 py-2 sticky left-0 min-w-12 max-w-12 bg-card z-10">
          <Checkbox
            checked={
              table?.getIsAllPageRowsSelected() ||
              (table?.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
          />
        </TableHead>

        {salaryEntryColumnIdArray?.map((id) => {
          const column = table
            ?.getAllLeafColumns()
            ?.find((col: any) => col.id === id);

          if (column && !column.getIsVisible()) return null;

          const uniqueField = uniqueFields?.find((f) => f.name === id);

          return (
            <TableHead
              key={id}
              className={cn(
                "px-4 py-2 min-w-24 max-w-24 select-none",
                id === "sr_no" &&
                "md:sticky md:left-12 md:bg-card min-w-20 max-w-20 md:z-10",
                id === "employee_code" &&
                "md:sticky md:left-32 md:bg-card md:z-10 min-w-36 max-w-36",
                id === "name" && "min-w-52 max-w-52",
                id === "site" && "min-w-36 max-w-36",
                id === "project" && "min-w-36 max-w-36",
                id === "department" && "min-w-36 max-w-36",
                id.length > 7 &&
                id !== "employee_code" &&
                id !== "department" &&
                "min-w-40 max-w-40",
              )}
              onContextMenu={(e) => {
                if (isEditable && uniqueField && uniqueField.id) {
                  e.preventDefault();
                  setMenuPosition({ x: e.clientX, y: e.clientY });
                  setSelectedField({
                    id,
                    name: uniqueField.name,
                    type: uniqueField.type,
                    fieldId: uniqueField.id,
                  });
                  setIsMenuOpen(true);
                }
              }}
            >
              <Button
                className="p-0 hover:bg-transparent space-x-1 disabled:opacity-100 h-auto whitespace-normal text-left flex items-center justify-start w-full overflow-hidden"
                variant="ghost"
                disabled={!isEnableSorting(id)}
                onClick={() => sort(id)}
              >
                <span className="capitalize break-words leading-tight text-xs">
                  {columnName(id)}
                </span>
                <Icon
                  name="chevron-up"
                  className={cn(
                    "hidden shrink-0",
                    sortingId === id && sortingOrder === "desc" && "flex",
                  )}
                />
                <Icon
                  name="chevron-down"
                  className={cn(
                    "hidden shrink-0",
                    sortingId === id && sortingOrder === "asc" && "flex",
                  )}
                />
              </Button>
            </TableHead>
          );
        })}

        <TableHead className="sticky right-0 min-w-20 max-w-20 bg-card z-20">
          {selectedField && (
            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <span
                  style={{
                    position: "fixed",
                    left: menuPosition.x,
                    top: menuPosition.y,
                    width: 1,
                    height: 1,
                  }}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive flex items-center gap-2 cursor-pointer"
                  onSelect={() => {
                    setIsDeleteDialogOpen(true);
                  }}
                >
                  <Icon name="trash" className="h-4 w-4" />
                  <span>Remove Column</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {selectedField && (
            <AlertDialog
              open={isDeleteDialogOpen}
              onOpenChange={(open) => {
                setIsDeleteDialogOpen(open);
                if (!open) {
                  setDeleteConfirmValue("");
                  setDeleteError([]);
                  setSelectedField(null);
                }
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    the payroll field <strong>{selectedField.name}</strong> from
                    this payroll.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <p className="text-sm text-foreground/80">
                    Please type{" "}
                    <i className="text-foreground font-medium">{DELETE_TEXT}</i>{" "}
                    to confirm.
                  </p>
                  <Input
                    type="text"
                    autoFocus
                    value={deleteConfirmValue}
                    onChange={(e) => {
                      setDeleteConfirmValue(e.target.value);
                      setDeleteError([]);
                    }}
                    className="border border-input rounded-md h-10 w-full"
                    placeholder="Confirm your action"
                    onPaste={(e) => {
                      e.preventDefault();
                      return false;
                    }}
                  />
                  <ErrorList errors={deleteError} />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    onClick={() => {
                      setDeleteConfirmValue("");
                      setDeleteError([]);
                      setIsDeleteDialogOpen(false);
                    }}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className={cn(buttonVariants({ variant: "destructive" }))}
                    onClick={handleDeleteConfirm}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}
