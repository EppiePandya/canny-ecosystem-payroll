import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Link } from "@remix-run/react";
import { useState } from "react";
import { hasPermission, updateRole } from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import { useUser } from "@/utils/user";

import { DeletePaymentTemplate } from "./delete-payment-template";
import { ViewPaymentTemplateVersionsDialog } from "./view-payment-template-versions-dialog";

export function PaymentTemplateOptionsDropdown({
  template,
  triggerChild,
}: {
  template: any;
  triggerChild: React.ReactNode;
}) {
  const { role } = useUser();
  const [open, setOpen] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const canUpdate = hasPermission(
    role,
    `${updateRole}:${attribute.paymentComponent}`,
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {triggerChild}
        <DropdownMenuContent align="end" className="w-56">
          {canUpdate && (
            <>
              <DropdownMenuItem asChild>
                <Link
                  to={`${template.id}/update-payment-template`}
                  prefetch="intent"
                  className="flex items-center"
                >
                  <Icon name="edit" className="mr-2" size="sm" />
                  Edit Template
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  to={`${template.id}/add-increment`}
                  prefetch="intent"
                  className="flex items-center"
                >
                  <Icon name="plus" className="mr-2" size="sm" />
                  Add Increment
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setShowVersions(true);
                }}
                className="flex items-center"
              >
                <Icon name="clock" className="mr-2" size="sm" />
                View Versions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DeletePaymentTemplate templateId={template.id} />
        </DropdownMenuContent>
      </DropdownMenu>

      <ViewPaymentTemplateVersionsDialog
        open={showVersions}
        onOpenChange={setShowVersions}
        templateName={template.name}
        templateId={template.id}
      />
    </>
  );
}
