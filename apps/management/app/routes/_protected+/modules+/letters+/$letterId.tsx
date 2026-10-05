import { ErrorBoundary } from "@/components/error-boundary";
import { LetterDocument } from "@/components/letter/letter-templates/letter-document";
import { getLetterById } from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@canny_ecosystem/ui/dialog";
import { Button } from "@canny_ecosystem/ui/button";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { letterId } = params;
  const { supabase } = getSupabaseWithHeaders({ request });
  const baseUrl = new URL(request.url).origin;

  try {
    if (!letterId) {
      throw new Error("Letter ID is required");
    }

    const { data: letterData, error: letterError } = await getLetterById({
      supabase,
      letterId,
    });

    if (letterError) {
      throw letterError;
    }

    return json({
      letterData,
      baseUrl,
      error: null,
    });
  } catch (error: any) {
    return json({
      letterData: null,
      baseUrl,
      error: error?.message || "Failed to load letter",
    });
  }
}

export default function LetterPreview() {
  const { letterData, baseUrl, error } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handleOpenChange = () => {
    navigate("/modules/letters");
  };

  if (error) {
    return (
      <ErrorBoundary
        error={typeof error === "string" ? { message: error } : error}
        message={typeof error === "string" ? error : "Failed to load letter"}
      />
    );
  }

  return (
    <Dialog defaultOpen onOpenChange={handleOpenChange}>
      <DialogTitle />
      <DialogDescription className="text-muted-foreground" />
      <DialogContent
        disableIcon
        className="max-w-4xl h-[92vh] p-0 flex flex-col overflow-hidden bg-background"
      >
        <div className="flex justify-between items-center px-4 py-2.5 border-b bg-muted/40 shrink-0">
          <div className="text-sm font-semibold">
            {letterData?.letter_name || "Letter Preview"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print Letter
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-neutral-100 dark:bg-neutral-900">
          <LetterDocument data={letterData} baseUrl={baseUrl} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
