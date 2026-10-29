import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";

interface CellProps {
  readonly label: string;
  readonly title: ComponentChildren;
  readonly meta?: ComponentChildren;
  readonly className?: string;
  readonly children?: (titleId: string) => ComponentChildren;
}

export function Cell({ label, title, meta, className, children }: CellProps) {
  const titleId = useId();
  return (
    <section class={className ? `cell ${className}` : "cell"} aria-labelledby={titleId}>
      <div class="cell-head">
        <span class="label">{label}</span>
        {meta !== undefined && <span class="meta">{meta}</span>}
      </div>
      <h2 class="cell-title" id={titleId}>
        {title}
      </h2>
      {children?.(titleId)}
    </section>
  );
}
