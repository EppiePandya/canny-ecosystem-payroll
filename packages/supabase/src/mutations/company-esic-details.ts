import { convertToNull } from "@canny_ecosystem/utils";
import type {
  CompanyEsicDetailsDatabaseInsert,
  CompanyEsicDetailsDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";

export async function createCompanyEsicDetail({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: CompanyEsicDetailsDatabaseInsert;
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
    .from("company_esic_details")
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error("createCompanyEsicDetail Error:", error);
  }

  return { status, error };
}

export async function updateCompanyEsicDetailById({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: CompanyEsicDetailsDatabaseUpdate;
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
    .from("company_esic_details")
    .update(updateData)
    .eq("id", data.id!);

  if (error) {
    console.error("updateCompanyEsicDetailById Error:", error);
  }

  return { status, error };
}

export async function deleteCompanyEsicDetail({
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
    .from("company_esic_details")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteCompanyEsicDetail Error:", error);
  }

  return { status, error };
}
