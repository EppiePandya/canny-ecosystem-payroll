import { SUPABASE_LETTER_COMPONENTS_URL_PREFIX } from "@canny_ecosystem/utils/constant";

export function LetterFooter({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <img
      src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/letters-footer.png`}
      alt="Letter Footer"
      className={className || "w-full object-contain"}
      style={style}
    />
  );
}
