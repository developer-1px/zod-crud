import type { KeyboardEvent } from "react";

export function inlineValueKeyDown({
  onCancel,
  onCommit,
}: {
  onCancel: () => void;
  onCommit: () => void;
}) {
  return (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
}
