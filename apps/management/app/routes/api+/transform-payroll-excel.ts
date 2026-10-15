import { transformPayrollExcelToJson } from "@/utils/server/payroll-excel-transform.server";
import { type ActionFunctionArgs, json } from "@remix-run/node";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json(
      { success: false, error: "Method not allowed" },
      { status: 405 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return json(
        { success: false, error: "No valid file uploaded" },
        { status: 400 },
      );
    }

    const fileObj = file as File;
    const arrayBuffer = await fileObj.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await transformPayrollExcelToJson(
      buffer,
      fileObj.name || "payroll.xlsx",
    );

    return json({
      ...result,
      success: true,
    });
  } catch (error: any) {
    console.error("AI Payroll Transformation Action Error:", error);
    return json(
      {
        success: false,
        error:
          error?.message ||
          "An error occurred while transforming the payroll file with AI.",
      },
      { status: 500 },
    );
  }
}
