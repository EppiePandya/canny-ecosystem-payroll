import { ErrorBoundary } from "@/components/error-boundary";
import { LoadingSpinner } from "@/components/loading-spinner";
import { cacheKeyPrefix, DEFAULT_ROUTE } from "@/constant";
import { clearExactCacheEntry, clientCaching } from "@/utils/cache";
import { getCompanyIdOrFirstCompany } from "@/utils/server/company.server";
import { getUserCookieOrFetchUser } from "@/utils/server/user.server";
import { useUser } from "@/utils/user";
import {
  createCompanyPrefix,
  deleteCompanyPrefix,
  updateCompanyPrefix,
} from "@canny_ecosystem/supabase/mutations";
import {
  getCompanyPrefixesByCompanyId,
  getSitesByCompanyId,
} from "@canny_ecosystem/supabase/queries";
import { getSupabaseWithHeaders } from "@canny_ecosystem/supabase/server";
import {
  formatDate,
  hasPermission,
  readRole,
  updateRole,
} from "@canny_ecosystem/utils";
import { attribute } from "@canny_ecosystem/utils/constant";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  json,
} from "@remix-run/node";
import {
  type ClientLoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from "@remix-run/react";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@canny_ecosystem/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@canny_ecosystem/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canny_ecosystem/ui/dropdown-menu";
import { Icon } from "@canny_ecosystem/ui/icon";
import { Input } from "@canny_ecosystem/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@canny_ecosystem/ui/table";
import { useToast } from "@canny_ecosystem/ui/use-toast";
import { cn } from "@canny_ecosystem/ui/utils/cn";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (!hasPermission(user?.role!, `${readRole}:${attribute.modules}`)) {
    return safeRedirect(DEFAULT_ROUTE, { headers });
  }

  const { companyId } = await getCompanyIdOrFirstCompany(
    request,
    supabase as any,
  );

  try {
    const { data: prefixes, error: prefixesError } =
      await getCompanyPrefixesByCompanyId({
        supabase: supabase as any,
        companyId: companyId!,
      });

    if (prefixesError) throw prefixesError;

    const { data: sites, error: sitesError } = await getSitesByCompanyId({
      supabase: supabase as any,
      companyId: companyId!,
    });

    if (sitesError) throw sitesError;

    return json({
      prefixes: prefixes || [],
      sites: sites || [],
      companyId: companyId!,
      error: null,
    });
  } catch (error: any) {
    console.error("Prefix Loader Error:", error);
    return json({
      prefixes: [],
      sites: [],
      companyId: companyId!,
      error: error.message || "Failed to load prefix settings",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { supabase, headers } = getSupabaseWithHeaders({ request });
  const { user } = await getUserCookieOrFetchUser(request, supabase as any);

  if (!hasPermission(user?.role!, `${updateRole}:${attribute.modules}`)) {
    return json(
      { status: "error", error: { message: "Unauthorized Action" } },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  try {
    if (intent === "create") {
      const name = formData.get("name")?.toString();
      const site_id = formData.get("site_id")?.toString() || null;
      const company_id = formData.get("company_id")?.toString();
      const is_default = formData.get("is_default") === "true";

      if (!name) {
        return json(
          { status: "error", error: { message: "Name is required" } },
          { status: 400 },
        );
      }

      if (is_default && company_id) {
        const { error: resetError } = await (
          supabase.from("company_prefix") as any
        )
          .update({ is_default: false })
          .eq("company_id", company_id);
        if (resetError) {
          console.error("Failed to reset other prefix defaults:", resetError);
        }
      }

      const { error } = await createCompanyPrefix({
        supabase: supabase as any,
        data: {
          name,
          site_id,
          company_id,
          is_default,
        } as any,
      });

      if (error) {
        const errObj = error as any;
        let userMessage = errObj.message || String(error);
        if (
          errObj.message?.includes("company_prefix_site_id_key") ||
          errObj.code === "23505"
        ) {
          userMessage =
            "This site already has a prefix assigned. Please choose a different site or edit the existing prefix.";
        }
        return json(
          { status: "error", error: { message: userMessage } },
          { status: 400 },
        );
      }
      return json({ status: "success" });
    }

    if (intent === "update") {
      const id = formData.get("id")?.toString();
      const name = formData.get("name")?.toString();
      const site_id = formData.get("site_id")?.toString() || null;
      const company_id = formData.get("company_id")?.toString();
      const is_default = formData.get("is_default") === "true";

      if (!id || !name) {
        return json(
          { status: "error", error: { message: "ID and Name are required" } },
          { status: 400 },
        );
      }

      if (is_default && company_id) {
        const { error: resetError } = await (
          supabase.from("company_prefix") as any
        )
          .update({ is_default: false })
          .eq("company_id", company_id)
          .neq("id", id);
        if (resetError) {
          console.error("Failed to reset other prefix defaults:", resetError);
        }
      }

      const { error } = await updateCompanyPrefix({
        supabase: supabase as any,
        data: {
          id,
          name,
          site_id,
          is_default,
        } as any,
      });

      if (error) {
        const errObj = error as any;
        let userMessage = errObj.message || String(error);
        if (
          errObj.message?.includes("company_prefix_site_id_key") ||
          errObj.code === "23505"
        ) {
          userMessage =
            "This site already has a prefix assigned. Please choose a different site or edit the existing prefix.";
        }
        return json(
          { status: "error", error: { message: userMessage } },
          { status: 400 },
        );
      }
      return json({ status: "success" });
    }

    if (intent === "delete") {
      const id = formData.get("id")?.toString();

      if (!id) {
        return json(
          { status: "error", error: { message: "ID is required" } },
          { status: 400 },
        );
      }

      const { error } = await deleteCompanyPrefix({
        supabase: supabase as any,
        id,
      });

      if (error) return json({ status: "error", error }, { status: 400 });
      return json({ status: "success" });
    }

    return json(
      { status: "error", error: { message: "Invalid intent" } },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("Prefix Action Error:", error);
    return json(
      { status: "error", error: { message: error.message } },
      { status: 500 },
    );
  }
}

export async function clientLoader(args: ClientLoaderFunctionArgs) {
  return clientCaching(cacheKeyPrefix.company_config, args);
}

clientLoader.hydrate = true;

export default function PrefixRoute() {
  const { prefixes, sites, companyId, error } = useLoaderData<typeof loader>();
  const { role } = useUser();
  const { toast } = useToast();
  const fetcher = useFetcher<any>();
  const [searchString, setSearchString] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [prefixId, setPrefixId] = useState("");
  const [prefixName, setPrefixName] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [isDefaultChecked, setIsDefaultChecked] = useState(false);

  const isEditable = hasPermission(role, `${updateRole}:${attribute.modules}`);
  const hasDefaultPrefix = prefixes.some((p: any) => p.is_default);

  // Handle successful form submission
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.status === "success") {
        toast({
          title: "Success",
          description: "Operation completed successfully",
        });
        setShowForm(false);
        clearExactCacheEntry(cacheKeyPrefix.company_config);
      } else {
        toast({
          title: "Error",
          description: fetcher.data.error?.message || "Operation failed",
          variant: "destructive",
        });
      }
    }
  }, [fetcher.state, fetcher.data, toast]);

  if (error) {
    return (
      <div className="px-4">
        <ErrorBoundary
          error={new Error(error)}
          message="Failed to load prefixes"
        />
      </div>
    );
  }

  if (showForm) {
    return (
      <section className="px-4 lg:px-10 xl:px-14 max-sm:px-0 2xl:px-40 py-4">
        <fetcher.Form
          method="POST"
          className="flex flex-col"
          onSubmit={() => {
            clearExactCacheEntry(cacheKeyPrefix.company_config);
          }}
        >
          <Card className="max-sm:px-0">
            <CardHeader>
              <CardTitle className="text-3xl capitalize">
                {dialogMode === "add" ? "Create Prefix" : "Update Prefix"}
              </CardTitle>
              <CardDescription>
                {dialogMode === "add" ? "Create" : "Update"} prefix for the site
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              <input
                type="hidden"
                name="intent"
                value={dialogMode === "add" ? "create" : "update"}
              />
              <input type="hidden" name="company_id" value={companyId} />
              {dialogMode === "edit" && (
                <input type="hidden" name="id" value={prefixId} />
              )}

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  Prefix Name
                </label>
                <Input
                  type="text"
                  name="name"
                  placeholder="Enter Prefix Name"
                  value={prefixName}
                  onChange={(e) => setPrefixName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  Site
                </label>
                <select
                  name="site_id"
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Global (All Sites)</option>
                  {sites.map((site: any) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </div>

              {(dialogMode === "edit" || !hasDefaultPrefix) && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="is_default"
                    name="is_default"
                    value="true"
                    checked={isDefaultChecked}
                    onChange={(e) => setIsDefaultChecked(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                  />
                  <label
                    htmlFor="is_default"
                    className="text-sm font-medium text-foreground cursor-pointer select-none"
                  >
                    Set as Default Prefix
                  </label>
                </div>
              )}
            </CardContent>

            <div className="flex justify-end gap-3 border-t p-6 bg-card rounded-b-lg">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={fetcher.state !== "idle"}>
                {fetcher.state !== "idle" ? "Saving..." : "Save"}
              </Button>
            </div>
          </Card>
        </fetcher.Form>
      </section>
    );
  }

  const filteredItems = prefixes.filter((item: any) => {
    const nameMatch = item.name
      ?.toLowerCase()
      .includes(searchString.toLowerCase());
    const siteMatch = item.site?.name
      ?.toLowerCase()
      .includes(searchString.toLowerCase());
    return nameMatch || siteMatch;
  });

  const handleOpenAdd = () => {
    setDialogMode("add");
    setPrefixId("");
    setPrefixName("");
    setSelectedSiteId("");
    setIsDefaultChecked(false);
    setShowForm(true);
  };

  const handleOpenEdit = (item: any) => {
    setDialogMode("edit");
    setPrefixId(item.id);
    setPrefixName(item.name || "");
    setSelectedSiteId(item.site_id || "");
    setIsDefaultChecked(item.is_default || false);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this prefix?")) {
      clearExactCacheEntry(cacheKeyPrefix.company_config);
      fetcher.submit({ intent: "delete", id }, { method: "post" });
    }
  };

  return (
    <div className="px-4">
      <section className="py-4">
        <div className="w-full flex items-center justify-between pb-4">
          <div className="w-full lg:w-3/5 2xl:w-1/3 flex items-center gap-4">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Icon
                  name="magnifying-glass"
                  size="sm"
                  className="text-gray-400"
                />
              </div>
              <Input
                placeholder="Search Prefix"
                value={searchString}
                onChange={(e) => setSearchString(e.target.value)}
                className="pl-8 h-10 w-full focus-visible:ring-0 shadow-none"
              />
            </div>
            <Button
              onClick={handleOpenAdd}
              className={cn(
                buttonVariants({ variant: "primary-outline" }),
                "flex items-center gap-1 shrink-0",
                !isEditable && "hidden",
              )}
            >
              <span>Add</span>
              <span className="hidden md:flex justify-end">Prefix</span>
            </Button>
          </div>
        </div>

        <div className="relative mb-8">
          <div
            className={cn(
              "relative border overflow-x-auto rounded",
              filteredItems.length === 0 && "border-none",
            )}
          >
            <Table>
              <TableHeader
                className={cn(filteredItems.length === 0 && "hidden")}
              >
                <TableRow>
                  <TableHead className="h-[40px] md:h-[45px] px-3 md:px-4 text-left font-medium text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="h-[40px] md:h-[45px] px-3 md:px-4 text-left font-medium text-muted-foreground">
                    Site
                  </TableHead>
                  <TableHead className="h-[40px] md:h-[45px] px-3 md:px-4 text-left font-medium text-muted-foreground">
                    Created At
                  </TableHead>
                  <TableHead className="sticky right-0 min-w-20 max-w-20 bg-card z-10 h-[40px] md:h-[45px] px-3 md:px-4 text-right font-medium text-muted-foreground" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow className="border-none">
                    <TableCell
                      colSpan={4}
                      className="h-80 bg-background grid place-items-center text-center tracking-wide text-xl capitalize text-muted-foreground"
                    >
                      No Prefix Found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item: any) => (
                    <TableRow
                      key={item.id}
                      className="relative h-[40px] md:h-[45px] cursor-default select-text"
                    >
                      <TableCell className="h-[60px] px-3 md:px-4 py-2 table-cell font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <p className="truncate w-28 font-semibold">
                            {item.name}
                          </p>
                          {item.is_default && (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                              Default
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="h-[60px] px-3 md:px-4 py-2 table-cell text-muted-foreground font-medium">
                        <p className="truncate w-28">
                          {item.site ? item.site.name : "Global (All Sites)"}
                        </p>
                      </TableCell>
                      <TableCell className="h-[60px] px-3 md:px-4 py-2 table-cell text-muted-foreground">
                        <p className="truncate w-28">
                          {(formatDate(item.created_at) ?? "--").toString()}
                        </p>
                      </TableCell>
                      <TableCell className="sticky right-0 min-w-20 max-w-20 bg-card z-10 h-[60px] px-3 md:px-4 py-2 table-cell text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className={cn(
                                "h-8 w-8 p-0",
                                !isEditable && "hidden",
                              )}
                            >
                              <span className="sr-only">Open menu</span>
                              <Icon name="dots-vertical" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={10} align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                className="flex cursor-pointer"
                                onClick={() => handleOpenEdit(item)}
                              >
                                Edit Prefix
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="flex cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                                onClick={() => handleDelete(item.id)}
                              >
                                Delete Prefix
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>
    </div>
  );
}

function safeRedirect(to: string, init?: ResponseInit) {
  return new Response("", {
    status: 302,
    headers: {
      Location: to,
      ...(init?.headers || {}),
    },
  });
}
