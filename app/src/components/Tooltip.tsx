import { useId, type ReactNode } from "react";

export default function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <span className="tooltip">
      <button
        type="button"
        className="tooltip-trigger"
        aria-label={`Learn about ${label}`}
        aria-describedby={id}
      >
        ?
      </button>
      <span className="tooltip-content" id={id} role="tooltip">
        {children}
      </span>
    </span>
  );
}
