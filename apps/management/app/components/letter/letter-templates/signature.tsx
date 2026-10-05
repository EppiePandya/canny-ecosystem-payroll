import { SUPABASE_LETTER_COMPONENTS_URL_PREFIX } from "@canny_ecosystem/utils/constant";

type SignaturePosition = {
  bottom?: number | string;
  right?: number | string;
  left?: number | string;
  top?: number | string;
  width?: number | string;
};

export function Signature({
  src,
  position = {},
  className = "",
}: {
  src: string;
  position?: SignaturePosition;
  className?: string;
}) {
  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      style={{
        width: position.width ? `${position.width}px` : "180px",
        height: "55px",
      }}
    >
      <img
        src={src}
        alt="Signature"
        className="relative z-10 w-28 h-auto object-contain"
        crossOrigin="anonymous"
      />
      <img
        src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/company-stamp.png`}
        alt="Stamp Overlay"
        className="absolute top-0 left-20 w-16 h-auto opacity-85 pointer-events-none"
        crossOrigin="anonymous"
      />
    </div>
  );
}
