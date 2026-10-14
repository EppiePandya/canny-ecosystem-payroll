import { Button } from "@canny_ecosystem/ui/button";
import { Icon } from "@canny_ecosystem/ui/icon";

interface MailHeaderProps {
  senderEmail: string;
  activeTab: "inbox" | "compose";
  setActiveTab: (tab: "inbox" | "compose") => void;
  onBackToInbox: () => void;
  unreadCount: number;
  isRevalidating: boolean;
  onRevalidate: () => void;
}

export function MailHeader({
  senderEmail,
  activeTab,
  setActiveTab,
  onBackToInbox,
  unreadCount,
  isRevalidating,
  onRevalidate,
}: MailHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b px-4 py-3 gap-3 bg-card/50">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20">
          <Icon name="email" className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
            Mail Workspace
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
              {senderEmail}
            </span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Inbox and mail dispatcher for {senderEmail}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-muted p-1 border">
          <button
            type="button"
            onClick={onBackToInbox}
            className={`flex items-center justify-center gap-1.5 w-32 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "inbox"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-inbox"
            >
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
            Inbox
            {unreadCount > 0 && (
              <span className="ml-1 text-[10px] bg-primary text-primary-foreground font-bold px-1.5 py-0.2 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("compose")}
            className={`flex items-center justify-center gap-1.5 w-32 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "compose"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-square-pen"
            >
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
            </svg>
            Compose Mail
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRevalidate}
          disabled={isRevalidating}
          className="h-9 w-32 justify-center gap-1.5 text-xs font-semibold rounded-lg shadow-sm"
          title="Refresh Inbox"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`lucide lucide-refresh-cw ${
              isRevalidating ? "animate-spin" : ""
            }`}
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          <span>Sync</span>
        </Button>
      </div>
    </div>
  );
}
