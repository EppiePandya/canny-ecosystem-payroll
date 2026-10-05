import { convertToNull } from "@canny_ecosystem/utils";
import type {
  CompanyPrefixDatabaseInsert,
  CompanyPrefixDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";

export async function createCompanyPrefix({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: CompanyPrefixDatabaseInsert;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const { error, status } = await supabase
    .from("company_prefix")
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error("createCompanyPrefix Error:", error);
  }

  return { status, error };
}

export async function updateCompanyPrefix({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: CompanyPrefixDatabaseUpdate & { id: string };
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const updateData = convertToNull(data);

  const { error, status } = await supabase
    .from("company_prefix")
    .update(updateData)
    .eq("id", data.id);

  if (error) {
    console.error("updateCompanyPrefix Error:", error);
  }

  return { status, error };
}

export async function deleteCompanyPrefix({
  supabase,
  id,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  id: string;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return { status: 400, error: "Unauthorized User" };
    }
  }

  const { error, status } = await supabase
    .from("company_prefix")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteCompanyPrefix Error:", error);
  }

  return { status, error };
}
