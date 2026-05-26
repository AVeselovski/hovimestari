import type { ReactNode } from "react";

export function SectionHead({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <p
      className={`text-[10px] uppercase tracking-[0.2em] ${className}`}
      style={{ color: "var(--ink)" }}
    >
      {children}
    </p>
  );
}
