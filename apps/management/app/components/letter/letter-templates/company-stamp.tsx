import { SUPABASE_LETTER_COMPONENTS_URL_PREFIX } from "@canny_ecosystem/utils/constant";

export function CompanyStamp({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={style}>
      <img
        src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/company-stamp.png`}
        alt="Company Stamp"
        className="w-28 h-auto object-contain pointer-events-none"
        crossOrigin="anonymous"
      />
    </div>
  );
}
