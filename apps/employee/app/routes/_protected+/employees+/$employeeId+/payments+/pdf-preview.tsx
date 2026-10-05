import { useNavigate, useSearchParams } from "@remix-run/react";
import { useEffect } from "react";

export default function PdfPreviewPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const pdfUrl = searchParams.get("file");

  useEffect(() => {
    if (!pdfUrl) navigate(-1);
  }, [pdfUrl, navigate]);

  if (!pdfUrl) {
    return (
      <div className="h-screen flex items-center justify-center text-red-500 text-lg">
        PDF file not found{" "}
      </div>
    );
  }

  const handleOverlayClick = () => navigate(-1);
  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
      onClick={handleOverlayClick}
    >
      {" "}
      <div
        className="relative w-[65%] h-[94%] bg-white rounded-xl overflow-visible shadow-2xl"
        onClick={stopPropagation}
      >
        <object data={pdfUrl} type="application/pdf" width="100%" height="100%">
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-gray-700 text-lg">
              Unable to preview PDF in browser.
            </p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-blue-600 text-white px-4 py-2 rounded-md"
            >
              Download PDF
            </a>
          </div>
        </object>
      </div>
    </div>
  );
}
