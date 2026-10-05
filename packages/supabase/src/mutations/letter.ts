import { convertToNull } from "@canny_ecosystem/utils";
import type {
  LetterDatabaseInsert,
  LetterDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";

export async function createLetter({
  supabase,
  letterData,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  letterData: LetterDatabaseInsert;
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
  const { isPdf, include_salary_structure, ...rest } = letterData as any;
  let content = rest.content || "";
  if (include_salary_structure && !content.includes("${salaryStructure}")) {
    content = (content ? `${content.trim()}\n\n` : "") + "${salaryStructure}";
  } else if (include_salary_structure === false && content.includes("${salaryStructure}")) {
    content = content.replace(/\$\{salaryStructure\}/g, "").trim();
  }

  const mappedData = {
    ...rest,
    content,
    ...(isPdf !== undefined ? { is_pdf: isPdf } : {}),
  };

  const { status, error } = await supabase
    .from("letter")
    .insert(mappedData)
    .select("id")
    .single();

  if (error) {
    console.error("createLetter Error", error);
  }

  return { status, error };
}

export async function updateLetterById({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: LetterDatabaseUpdate;
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
  const { isPdf, include_salary_structure, ...rest } = data as any;
  let content = rest.content || "";
  if (include_salary_structure && !content.includes("${salaryStructure}")) {
    content = (content ? `${content.trim()}\n\n` : "") + "${salaryStructure}";
  } else if (include_salary_structure === false && content.includes("${salaryStructure}")) {
    content = content.replace(/\$\{salaryStructure\}/g, "").trim();
  }

  const mappedData = {
    ...rest,
    content,
    ...(isPdf !== undefined ? { is_pdf: isPdf } : {}),
  };
  const updateData = convertToNull(mappedData);

  const { error, status } = await supabase
    .from("letter")
    .update(updateData)
    .eq("id", data.id!);

  if (error) {
    console.error("updateLetter Error", error);
  }

  return { status, error };
}

export async function deleteLetterById({
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

  const { error, status } = await supabase.from("letter").delete().eq("id", id);

  if (error) {
    console.error("deleteLetterById Error", error);
  }

  return { status, error };
}
