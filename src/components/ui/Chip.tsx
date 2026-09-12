import type { ReactNode } from "react";

export function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="chip-btn" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}
