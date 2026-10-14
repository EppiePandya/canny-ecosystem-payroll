import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";

interface MailEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  url: string;
}

export function MailEmployeeModal({
  isOpen,
  onClose,
  title,
  url,
}: MailEmployeeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground border shadow-2xl rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="p-4 border-b flex items-center justify-between bg-muted/40 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Icon name="employee" className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {title || "Create New Employee"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Complete onboarding details pre-filled from email
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full"
          >
            <Icon name="cross" className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 w-full h-full relative bg-background">
          <iframe
            src={url}
            className="w-full h-full border-0 absolute inset-0"
            title="Employee Onboarding Form"
          />
        </div>
      </div>
    </div>
  );
}
