import { convertToNull } from "@canny_ecosystem/utils";
import type {
  PaymentTemplateComponentDatabaseInsert,
  PaymentTemplateComponentDatabaseRow,
  PaymentTemplateComponentDatabaseUpdate,
  PaymentTemplateDatabaseInsert,
  PaymentTemplateDatabaseUpdate,
  TypedSupabaseClient,
} from "../types";
import {
  deletePaymentTemplateVersions,
  updatePaymentTemplateVersions,
  createPaymentTemplateVersions,
} from "./payment-template-versions";
import { upsertPaymentStatutoryComponents } from "./payment-statutory-components";

export async function createPaymentTemplateWithComponents({
  supabase,
  templateData,
  templateComponentsData,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  templateData: PaymentTemplateDatabaseInsert;
  templateComponentsData?: Omit<
    PaymentTemplateComponentDatabaseInsert,
    "template_id"
  >[];
  bypassAuth?: boolean;
}) {
  const { data, status, error } = await createPaymentTemplate({
    supabase,
    data: templateData,
    bypassAuth,
  });

  if (error) {
    console.error("createPaymentTemplateWithComponents Error", error);
    return {
      status,
      templateError: error,
      templateComponentsError: null,
      id: null,
    };
  }

  if (data?.id && templateComponentsData?.length) {
    const finalTemplateComponentsData = templateComponentsData.map(
      ({ id, ...component }) => ({
        ...component,
        template_id: data.id,
      }),
    );

    const { error: templateComponentsError } =
      await createMultiPaymentTemplateComponents({
        supabase,
        dataArray: finalTemplateComponentsData,
        bypassAuth,
      });

    if (templateComponentsError) {
      return {
        status,
        templateError: null,
        templateComponentsError,
        id: data?.id,
      };
    }
  }

  return {
    status,
    templateError: null,
    templateComponentsError: null,
    id: data?.id,
  };
}

export async function createPaymentTemplate({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: PaymentTemplateDatabaseInsert;
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

  const {
    error,
    status,
    data: supabaseData,
  } = await supabase
    .from("payment_templates")
    .insert(data)
    .select("id")
    .single();

  if (error) {
    console.error("createPaymentTemplate Error", error);
  }

  return { data: supabaseData, status, error };
}

export async function upsertUnifiedPaymentTemplate({
  supabase,
  templateData,
  templateVersionsData,
  templateComponentsData,
  statutoryComponentsData,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  templateData: PaymentTemplateDatabaseInsert | PaymentTemplateDatabaseUpdate;
  templateVersionsData: any;
  templateComponentsData?: any[];
  statutoryComponentsData?: any;
  bypassAuth?: boolean;
}) {
  let templateId = (templateData as any).id;
  if (templateId) {
    const { status, error } = await updatePaymentTemplate({
      supabase,
      data: templateData as PaymentTemplateDatabaseUpdate,
      bypassAuth,
    });
    if (error) return { status, error };
  } else {
    const { data, status, error } = await createPaymentTemplate({
      supabase,
      data: templateData as PaymentTemplateDatabaseInsert,
      bypassAuth,
    });
    if (error) return { status, error };
    templateId = data?.id;
  }

  let versionId = templateVersionsData?.id;
  if (versionId) {
    const { status, error } = await updatePaymentTemplateVersions({
      supabase,
      data: {
        ...templateVersionsData,
        template_id: templateId,
      },
      bypassAuth,
    });

    if (error) return { status, error };
  } else {
    const {
      data: versionData,
      status,
      error,
    } = await createPaymentTemplateVersions({
      supabase,
      data: {
        ...templateVersionsData,
        template_id: templateId,
      },
      bypassAuth,
    });

    if (error) return { status, error };
    versionId = versionData?.id;
  }

  if (statutoryComponentsData) {
    const { error: statutoryError, status: statutoryStatus } =
      await upsertPaymentStatutoryComponents({
        supabase,
        data: {
          ...statutoryComponentsData,
          template_version_id: versionId,
        },
        bypassAuth,
      });

    if (statutoryError)
      return { status: statutoryStatus, error: statutoryError };
  }

  if (templateComponentsData) {
    const { error, status } =
      await updateMultiPaymentTemplateComponentsWithCreation({
        supabase,
        templateVersionId: versionId!,
        dataArray: templateComponentsData,
        bypassAuth,
      });

    if (error) return { status, error };
  }

  return { status: 200, error: null, id: templateId };
}

export async function updatePaymentTemplate({
  supabase,
  data,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  data: PaymentTemplateDatabaseUpdate;
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const updateData = convertToNull(data);

  const {
    data: supabaseData,
    error,
    status,
  } = await supabase
    .from("payment_templates")
    .update(updateData)
    .eq("id", data.id!)
    .select("id")
    .single();

  if (error) console.error("updatePaymentTemplate Error", error);

  return { data: supabaseData, status, error };
}

export async function deletePaymentTemplate({
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

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const { data: versions } = await supabase
    .from("payment_template_versions")
    .select("id")
    .eq("template_id", id);

  if (versions?.length) {
    const versionIds = versions.map((v) => v.id);

    // Delete components linked to these versions
    await supabase
      .from("payment_template_components")
      .delete()
      .in("template_version_id", versionIds);

    // Delete statutory components linked to these versions
    await supabase
      .from("payment_statutory_components")
      .delete()
      .in("template_version_id", versionIds);
  }

  await deletePaymentTemplateVersions({ supabase, templateId: id, bypassAuth });

  const { error, status } = await supabase
    .from("payment_templates")
    .delete()
    .eq("id", id);

  if (error) console.error("deletePaymentTemplate Error", error);

  return { status, error };
}

export async function removeOldTemplateComponents({
  supabase,
  templateVersionId,
  templateComponentsData,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  templateVersionId: string;
  templateComponentsData: PaymentTemplateComponentDatabaseUpdate[];
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const componentIds = templateComponentsData.map((component) => component.id);

  const { data: existingComponents, error: fetchError } = await supabase
    .from("payment_template_components")
    .select("id")
    .eq("template_version_id", templateVersionId);

  if (fetchError) {
    console.error("error fetching existing components", fetchError);
    return { status: 400, error: fetchError };
  }

  const existingComponentIds = existingComponents.map(
    (component) => component.id,
  );

  const componentsToDelete = existingComponentIds.filter(
    (id) => !componentIds.includes(id),
  );

  if (componentsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("payment_template_components")
      .delete()
      .eq("template_version_id", templateVersionId)
      .in("id", componentsToDelete);

    if (deleteError) {
      console.error("error deleting old components", deleteError);
    }
  }
}

export async function createMultiPaymentTemplateComponents({
  supabase,
  dataArray,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  dataArray: PaymentTemplateComponentDatabaseInsert[];
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
    .from("payment_template_components")
    .insert(dataArray);

  if (error) {
    console.error("createMultiPaymentTemplateComponents Error", error);
  }

  return {
    status,
    error,
  };
}

export async function updateMultiPaymentTemplateComponents({
  supabase,
  dataArray,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  dataArray: Omit<PaymentTemplateComponentDatabaseUpdate, "created_at">[];
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const updateDataArray = dataArray.map((data) => {
    return convertToNull(data);
  });

  const { error, status } = await supabase
    .from("payment_template_components")
    .upsert(updateDataArray as PaymentTemplateComponentDatabaseRow[], {
      onConflict: "id",
      ignoreDuplicates: false,
    });

  if (error) console.error("updateMultiPaymentTemplateComponents Error", error);

  return { status, error };
}

export async function updateMultiPaymentTemplateComponentsWithCreation({
  supabase,
  templateVersionId,
  dataArray,
  bypassAuth = false,
}: {
  supabase: TypedSupabaseClient;
  templateVersionId: string;
  dataArray: Omit<PaymentTemplateComponentDatabaseUpdate, "created_at">[];
  bypassAuth?: boolean;
}) {
  if (!bypassAuth) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return { status: 400, error: "Unauthorized User" };
  }

  const toUpdate = dataArray.filter((component) => component.id);
  const toCreate = dataArray.filter((component) => !component.id);

  let status = 200;
  let error = null;

  await removeOldTemplateComponents({
    supabase,
    templateVersionId,
    templateComponentsData: dataArray,
    bypassAuth,
  });

  if (toUpdate.length > 0) {
    const { error: updateError, status: updateStatus } =
      await updateMultiPaymentTemplateComponents({
        supabase,
        dataArray: toUpdate.map((c) => ({
          ...c,
          template_version_id: templateVersionId,
        })),
        bypassAuth,
      });

    if (updateError) {
      console.error("Error updating components:", updateError);
      status = updateStatus || 500;
      error = updateError;
    }
  }

  if (toCreate.length > 0) {
    const finalToCreate = toCreate.map(({ id, ...component }) => ({
      ...component,
      template_version_id: templateVersionId,
    }));

    const { error: createError, status: createStatus } =
      await createMultiPaymentTemplateComponents({
        supabase,
        dataArray: finalToCreate as PaymentTemplateComponentDatabaseInsert[],
        bypassAuth,
      });

    if (createError) {
      console.error("Error creating components:", createError);
      status = createStatus || 500;
      error = createError;
    }
  }

  return { status, error };
}
