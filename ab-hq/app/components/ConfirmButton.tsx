"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Two-click delete guard: first click arms the button (it turns orange and
 * asks for confirmation), second click within 3 seconds executes. Armed
 * state auto-disarms so a stray click never lingers.
 */
export default function ConfirmButton({
  className = "",
  label,
  confirmLabel = "Sure? Click again",
  title,
  onConfirm,
}: {
  className?: string;
  label: ReactNode;
  confirmLabel?: ReactNode;
  title?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (
    <button
      type="button"
      className={`${className}${armed ? " confirm-armed" : ""}`}
      title={armed ? "Click again to confirm" : title}
      onClick={() => {
        if (armed) {
          if (timer.current) clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
