import type {
  CompanyConfigDatabaseRow,
  CompanyDatabaseRow,
  DocumentsDatabaseRow,
  InferredType,
  LocationDatabaseRow,
  RelationshipDatabaseRow,
  TypedSupabaseClient,
} from "../types";

import { HARD_QUERY_LIMIT, SINGLE_QUERY_LIMIT } from "../constant";

export async function getCompanies({
  supabase,
}: {
  supabase: TypedSupabaseClient;
}) {
  const columns = ["id", "name", "logo"] as const;

  const { data, error } = await supabase
    .from("companies")
    .select(columns.join(","))
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: false })
    .returns<InferredType<CompanyDatabaseRow, (typeof columns)[number]>[]>();

  if (error) {
    console.error("getCompanies Error", error);
  }

  return { data, error };
}

export async function getFirstCompany({
  supabase,
}: {
  supabase: TypedSupabaseClient;
}) {
  const columns = ["id", "name"] as const;

  const { data, error } = await supabase
    .from("companies")
    .select(columns.join(","))
    .limit(SINGLE_QUERY_LIMIT)
    .order("created_at", { ascending: false })
    .single<InferredType<CompanyDatabaseRow, (typeof columns)[number]>>();

  if (error) {
    console.error("getFirstCompany Error", error);
  }

  return { data, error };
}

export async function getCompanyNameByCompanyId({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = ["name"] as const;

  const { data, error } = await supabase
    .from("companies")
    .select(columns.join(","))
    .eq("id", id)
    .single<InferredType<CompanyDatabaseRow, (typeof columns)[number]>>();

  if (error) {
    console.error("getCompanyNameById Error", error);
  }

  return { data, error };
}

export async function getCompanyById({
  supabase,
  id,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  id?: string;
  companyId?: string;
}) {
  const targetId = id || companyId;
  if (!targetId || targetId === "undefined" || targetId.trim() === "") {
    return { data: null, error: null };
  }

  const columns = [
    "id",
    "name",
    "email_suffix",
    "logo",
    "company_size",
    "company_type",
    "registration_number",
    "primary_number",
    "secondary_number",
    "contractor_id",
  ] as const;

  const { data, error } = await supabase
    .from("companies")
    .select(columns.join(","))
    .eq("id", targetId)
    .single<InferredType<CompanyDatabaseRow, (typeof columns)[number]>>();

  if (error) {
    console.error("getCompanyById Error", error);
  }

  return { data, error };
}

// Company Locations
export async function getLocationsForSelectByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  if (!companyId || companyId === "undefined" || companyId.trim() === "") {
    return { data: [], error: null };
  }

  const columns = ["id", "name"] as const;

  const { data, error } = await supabase
    .from("company_locations")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: false })
    .returns<InferredType<LocationDatabaseRow, (typeof columns)[number]>[]>();

  if (error) {
    console.error("getLocationsForSelectByCompanyId Error", error);
  }

  return { data, error };
}

export async function getLocationsByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  if (!companyId || companyId === "undefined" || companyId.trim() === "") {
    return { data: [], error: null };
  }

  const columns = [
    "id",
    "company_id",
    "name",
    "address_line_1",
    "address_line_2",
    "city",
    "state",
    "pincode",
    "latitude",
    "longitude",
    "pan_number",
    "gst_number",
    "is_primary",
  ] as const;

  const { data, error } = await supabase
    .from("company_locations")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: false })
    .returns<InferredType<LocationDatabaseRow, (typeof columns)[number]>[]>();

  if (error) {
    console.error("getLocationsByCompanyId Error", error);
  }

  return { data, error };
}

export async function getLocationById({
  supabase,
  id,
  locationId,
}: {
  supabase: TypedSupabaseClient;
  id?: string;
  locationId?: string;
}) {
  const targetId = id || locationId;
  if (!targetId || targetId === "undefined" || targetId.trim() === "") {
    return { data: null, error: null };
  }

  const columns = [
    "id",
    "company_id",
    "name",
    "address_line_1",
    "address_line_2",
    "city",
    "state",
    "pincode",
    "latitude",
    "longitude",
    "pan_number",
    "gst_number",
    "is_primary",
  ] as const;

  const { data, error } = await supabase
    .from("company_locations")
    .select(columns.join(","))
    .eq("id", targetId)
    .single<InferredType<LocationDatabaseRow, (typeof columns)[number]>>();

  if (error) {
    console.error("getLocationById Error", error);
  }

  return { data, error };
}

export async function getPrimaryLocationByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = [
    "id",
    "company_id",
    "name",
    "address_line_1",
    "address_line_2",
    "city",
    "state",
    "pincode",
    "latitude",
    "longitude",
    "gst_number",
    "pan_number",
    "is_primary",
  ] as const;

  const { data, error } = await supabase
    .from("company_locations")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .eq("is_primary", true)
    .order("created_at", { ascending: false })
    .limit(SINGLE_QUERY_LIMIT)
    .single<InferredType<LocationDatabaseRow, (typeof columns)[number]>>();

  if (error) {
    console.error("getPrimaryLocationByCompanyId Error", error);
  }

  return { data, error };
}

export type ManpowerVersion = {
  id: string;
  relationship_id: string;
  service_charge: number | null;
  reimbursement_charge: number | null;
  exit_charge: number | null;
  statutory_charge: number | null;
  service_charges_on: string | null;
  start_date: string;
  end_date: string | null;
  created_at: string;
};

export type RelationshipWithCompany = {
  id: string;
  company_id: string;
  relationship_type: string;
  is_active: boolean;
  created_at: string;
  company: { id: string; name: string };
  relationship_manpower_version?: ManpowerVersion[];
};

// Company Relationships
export async function getRelationshipsByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = [
    "id",
    "company_id",
    "relationship_type",
    "is_active",
    "created_at",
    "company:companies!company_id (id, name)",
    "relationship_manpower_version(*)",
  ] as const;

  const { data, error } = await supabase
    .from("company_relationships")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .limit(HARD_QUERY_LIMIT)
    .order("created_at", { ascending: false })
    .returns<RelationshipWithCompany[]>();

  if (error) {
    console.error("getRelationshipsByCompanyId Error", error);
  }

  return { data, error };
}

export async function getRelationshipById({
  supabase,
  id,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  id: string;
  companyId: string;
}) {
  const columns = [
    "id",
    "company_id",
    "relationship_type",
    "is_active",
    "company:companies!company_id (id, name)",
  ] as const;

  const { data, error } = await supabase
    .from("company_relationships")
    .select(columns.join(","))
    .eq("id", id)
    .eq("company_id", companyId)
    .single<RelationshipWithCompany>();

  if (error) {
    console.error("getRelationshipById Error", error);
  }

  return { data, error };
}

// Removed getRelationshipTermsById as terms field is no longer present
/** @deprecated Use getRelationshipsByCompanyId instead */
export async function getRelationshipsByParentAndChildCompanyId({
  supabase,
  parentCompanyId,
}: {
  supabase: TypedSupabaseClient;
  parentCompanyId: string;
  childCompanyId?: string;
}) {
  return getRelationshipsByCompanyId({ supabase, companyId: parentCompanyId });
}

// Company Documents
export async function getCompanyDocumentById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const columns = ["name", "url"] as const;

  const { data, error } = await supabase
    .from("company_documents")
    .select(columns.join(","))
    .eq("id", id)
    .single<InferredType<DocumentsDatabaseRow, (typeof columns)[number]>>();

  if (error) console.error("getCompanyDocumentById Error", error);

  return { data, error };
}

export async function getCompanyDocumentsByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const columns = ["name", "url", "id"] as const;

  const { data, error } = await supabase
    .from("company_documents")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(HARD_QUERY_LIMIT)
    .returns<InferredType<DocumentsDatabaseRow, (typeof columns)[number]>[]>();

  if (error) console.error("getCompanyDocumentsByCompanyId Error", error);

  return { data, error };
}

export async function getCompanyDocumentUrlByCompanyIdAndDocumentName({
  supabase,
  companyId,
  documentName,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
  documentName: string;
}) {
  const columns = ["url"] as const;

  const { data, error } = await supabase
    .from("company_documents")
    .select(columns.join(","))
    .eq("company_id", companyId)
    .eq("name", documentName)
    .single<DocumentsDatabaseRow>();

  if (error)
    console.error(
      "getCompanyDocumentUrlByCompanyIdAndDocumentName Error",
      error,
    );

  return { data, error };
}

// Removed getRelationshipsByParentAndChildCompanyId as child_company_id is no longer present

export async function getCannyCompanyIdByName({
  supabase,
  name,
}: {
  supabase: TypedSupabaseClient;
  name: string;
}) {
  const columns = ["name", "id"] as const;

  const { data, error } = await supabase
    .from("companies")
    .select(columns.join(","))
    .eq("name", name)
    .single<InferredType<CompanyDatabaseRow, (typeof columns)[number]>>();

  if (error) {
    console.error("getCannyCompanyIdByName Error", error);
  }

  return { data, error };
}

export async function getRelationshipManpowerVersionById({
  supabase,
  id,
}: {
  supabase: TypedSupabaseClient;
  id: string;
}) {
  const { data, error } = await supabase
    .from("relationship_manpower_version")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getRelationshipManpowerVersionById Error", error);
  }

  return { data, error };
}

export async function getCompanyConfigByCompanyId({
  supabase,
  companyId,
}: {
  supabase: TypedSupabaseClient;
  companyId: string;
}) {
  const { data, error } = await supabase
    .from("companies_config")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle<CompanyConfigDatabaseRow>();

  if (error) {
    console.error("getCompanyConfigByCompanyId Error", error);
  }

  return { data, error };
}
