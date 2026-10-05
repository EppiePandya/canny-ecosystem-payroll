import { buttonVariants, Button } from "@canny_ecosystem/ui/button";
import { createRole, hasPermission } from "@canny_ecosystem/utils";
import { defer, json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  Await,
  Link,
  Outlet,
  useLoaderData,
  useParams,
  useFetcher,
} from "@remix-run/react";
import { Suspense, useEffect } from "react";
import { clearExactCacheEntry } from "@/utils/cache";
import { cacheKeyPrefix } from "@/constant";
import { ErrorBoundary } from "@/components/error-boundary";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { useUser } from "@/utils/user";
import { useIsDocument } from "@canny_ecosystem/utils/hooks/is-document";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@canny_ecosystem/ui/command";
import { cn } from "@canny_ecosystem/ui/utils/cn";
import { attribute } from "@canny_ecosystem/utils/constant";
import type { EmployeeDocumentsDatabaseRow } from "@canny_ecosystem/supabase/types";
import DocumentCard from "@/components/employees/documents/document-card";
import { LoadingSpinner } from "@/components/loading-spinner";
import { getEmployeeDocuments } from "@canny_ecosystem/supabase/queries";
import { syncEmployeeDocumentsFromFolder } from "@/utils/automation/document-pipeline.server";
import { Icon } from "@canny_ecosystem/ui/icon";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const employeeId = params.employeeId ?? "";
  try {
    const { supabase } = getSupabaseWithHeaders({ request });
    const documentsPromise = getEmployeeDocuments({ supabase, employeeId });
    return defer({
      status: "success",
      message: "Employee documents found",
      error: null,
      documentsPromise,
      employeeId,
    });
  } catch (error) {
    return defer({
      status: "error",
      message: "Failed to fetch employee documents",
      error,
      documentsPromise: null,
      employeeId,
    });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const employeeId = params.employeeId ?? "";
  const { supabase } = getSupabaseWithHeaders({ request });
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "sync_local_documents") {
    try {
      const result = await syncEmployeeDocumentsFromFolder({
        supabase,
        employeeId,
      });

      return json({
        status: result.filesProcessed > 0 ? "success" : "info",
        message: result.message,
        filesProcessed: result.filesProcessed,
        reports: result.reports,
      });
    } catch (err: any) {
      return json({
        status: "error",
        message: err.message || "Failed to scan or sync documents",
      });
    }
  }

  return json({ status: "error", message: "Unknown intent" });
}

export default function Documents() {
  const { documentsPromise, employeeId, error } =
    useLoaderData<typeof loader>();
  const { role } = useUser();
  const { isDocument } = useIsDocument();
  const { toast } = useToast();
  const fetcher = useFetcher<typeof action>();

  const isSyncing = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data) {
      clearExactCacheEntry(`${cacheKeyPrefix.employee_documents}${employeeId}`);
      if (fetcher.data.status === "success") {
        toast({
          title: "Documents Ingested",
          description: fetcher.data.message,
          variant: "success",
        });
      } else if (fetcher.data.status === "info") {
        toast({
          title: "Folder Scan",
          description: fetcher.data.message,
        });
      } else if (fetcher.data.status === "error") {
        toast({
          title: "Sync Failed",
          description: fetcher.data.message,
          variant: "destructive",
        });
      }
    }
  }, [fetcher.data, employeeId]);

  if (error) {
    clearExactCacheEntry(`${cacheKeyPrefix.employee_documents}${employeeId}`);
    return <ErrorBoundary error={error} message="Failed to fetch documents" />;
  }

  return (
    <section className="p-4 w-full px-0">
      <div className="w-full mb-6">
        <Suspense fallback={<LoadingSpinner />}>
          <Await resolve={documentsPromise}>
            {(resolvedData) => {
              if (!resolvedData || !resolvedData.data) {
                clearExactCacheEntry(
                  `${cacheKeyPrefix.employee_documents}${employeeId}`,
                );
                return <ErrorBoundary message="Failed to fetch documents" />;
              }
              return (
                <Command className="overflow-visible w-full">
                  <div className="w-full lg:w-4/5 2xl:w-1/2 flex items-center gap-3">
                    <CommandInput
                      divClassName="border border-input rounded-md h-10 flex-1"
                      placeholder="Search Documents"
                      autoFocus={true}
                    />

                    <Link
                      to={`/employees/${employeeId}/documents/add-document`}
                      className={cn(
                        buttonVariants({ variant: "primary-outline" }),
                        "flex items-center gap-1 whitespace-nowrap h-10 px-3 text-xs",
                        !hasPermission(
                          role,
                          `${createRole}:${attribute.employeeDocuments}`,
                        ) && "hidden",
                      )}
                    >
                      <span>Add</span>
                      <span className="hidden md:flex justify-end">
                        Document
                      </span>
                    </Link>
                  </div>

                  <CommandEmpty
                    className={cn(
                      "w-full py-28 flex flex-col items-center justify-center text-center space-y-3",
                      !isDocument && "hidden",
                    )}
                  >
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                      <Icon name="check" className="w-6 h-6 opacity-40" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        No Document Found.
                      </h3>
                      <p className="text-xs text-muted-foreground max-w-md mt-1">
                        No employee documents uploaded yet. Click <strong>Add Document</strong> above to upload documents.
                      </p>
                    </div>
                  </CommandEmpty>

                  <CommandList className="max-h-full py-2 px-0 overflow-x-visible overflow-y-visible">
                    <DocumentsWrapper
                      data={resolvedData.data}
                      error={resolvedData.error}
                    />
                  </CommandList>
                </Command>
              );
            }}
          </Await>
        </Suspense>
      </div>
      <Outlet />
    </section>
  );
}

export function DocumentsWrapper({
  data,
  error,
}: {
  data: Pick<EmployeeDocumentsDatabaseRow, "document_type" | "url" | "id">[];
  error: unknown;
}) {
  const { employeeId } = useParams();
  const { toast } = useToast();

  useEffect(() => {
    if (error) {
      clearExactCacheEntry(`${cacheKeyPrefix.employee_documents}${employeeId}`);
      toast({
        title: "Error",
        description: "Failed to fetch documents",
        variant: "destructive",
      });
    }
  }, [error]);

  return (
    <CommandGroup className="w-full px-0">
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 px-0">
        {data?.map((document) => {
          return (
            <CommandItem
              key={document?.document_type}
              value={document?.document_type + document?.url}
              className="data-[selected=true]:bg-inherit data-[selected=true]:text-foreground px-0 py-0"
            >
              <DocumentCard
                documentData={{
                  name: document?.document_type,
                  url: document?.url,
                  documentId: document?.id,
                }}
              />
            </CommandItem>
          );
        })}
      </div>
    </CommandGroup>
  );
}
