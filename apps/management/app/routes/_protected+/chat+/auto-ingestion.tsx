import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  return redirect("/chat/folder-automation");
}

export default function AutoIngestionRedirect() {
  return null;
}
