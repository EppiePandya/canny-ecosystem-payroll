import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { useToast } from "@canny_ecosystem/ui/use-toast";

export interface AutoReplyConfigData {
  enabled: boolean;
  keyword: string;
  replyMessage: string;
  pollIntervalSeconds?: number;
  enabledAt?: string | null;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  lastErrorAt?: string | null;
  processedCount?: number;
}

export interface AutoReplyStatusData {
  isRunning: boolean;
  status: "Running" | "Disabled";
  config: AutoReplyConfigData;
  processedCount: number;
}

interface MailAutoReplyConfigProps {
  autoReplyStatus?: AutoReplyStatusData | null;
}

export function MailAutoReplyConfig({ autoReplyStatus }: MailAutoReplyConfigProps) {
  const fetcher = useFetcher<any>();
  const { toast } = useToast();

  const currentConfig = autoReplyStatus?.config || {
    enabled: false,
    keyword: "AUTO_REPLY",
    replyMessage: "Hello",
  };

  const [enabled, setEnabled] = useState<boolean>(currentConfig.enabled ?? false);

  // Sync local toggle state when autoReplyStatus updates from server
  useEffect(() => {
    if (autoReplyStatus?.config) {
      setEnabled(autoReplyStatus.config.enabled);
    }
  }, [autoReplyStatus]);

  // Toast feedback on toggle
  useEffect(() => {
    if (fetcher.data && fetcher.data.status === "auto_reply_config_updated") {
      toast({
        title: "Auto Reply",
        description: fetcher.data.message,
        variant: "success",
      });
    }
  }, [fetcher.data, toast]);

  const isSubmitting = fetcher.state !== "idle";

  const handleToggle = () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);

    const formData = new FormData();
    formData.append("intent", "update_auto_reply_config");
    formData.append("enabled", String(nextEnabled));
    formData.append("keyword", currentConfig.keyword || "AUTO_REPLY");
    formData.append("replyMessage", currentConfig.replyMessage || "Hello");

    fetcher.submit(formData, { method: "post" });
  };

  return (
    <div className="border-b bg-card/50 px-4 py-2 flex items-center justify-between">
      {/* Enable Auto Reply Toggle Only */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-medium text-foreground">
          Enable Auto Reply:
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={isSubmitting}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
            enabled ? "bg-emerald-500" : "bg-muted-foreground/30"
          }`}
          title={enabled ? "Turn OFF auto-reply" : "Turn ON auto-reply"}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
        <span
          className={`text-xs font-bold ${
            enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          }`}
        >
          {enabled ? "ON" : "OFF"}
        </span>
      </div>
    </div>
  );
}
