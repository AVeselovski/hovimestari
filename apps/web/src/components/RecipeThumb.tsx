import { Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { recipeImageUrl } from "../lib/api.js";

type Size = "sm" | "md";

const SIZE_PX: Record<Size, number> = { sm: 44, md: 72 };
const ICON_PX: Record<Size, number> = { sm: 18, md: 28 };
const RADIUS: Record<Size, string> = { sm: "rounded-lg", md: "rounded-xl" };

export function RecipeThumb({
  imageId,
  alt,
  size,
  className,
}: {
  imageId?: string;
  alt: string;
  size: Size;
  className?: string;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];
  const boxStyle = {
    width: `${px}px`,
    height: `${px}px`,
    borderColor: "var(--rule)",
    background: "var(--paper-2)",
  } as const;
  const boxClass = `shrink-0 border overflow-hidden ${RADIUS[size]}${
    className ? ` ${className}` : ""
  }`;

  if (!imageId || failed) {
    return (
      <div
        className={`${boxClass} flex items-center justify-center`}
        style={boxStyle}
        aria-hidden="true"
      >
        <ImageIcon size={ICON_PX[size]} style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  return (
    <div className={boxClass} style={boxStyle}>
      <img
        src={recipeImageUrl(imageId)}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
