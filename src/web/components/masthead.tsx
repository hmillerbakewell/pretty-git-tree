import type { ComponentChildren } from "preact";

function Wordmark() {
  return (
    <a class="wordmark" href="#make">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M7 25C14 25 18 7 25 7" stroke="var(--accent)" stroke-width="4" fill="none" stroke-linecap="round" />
        <path d="M7 7C14 7 18 25 25 25" stroke="var(--paper)" stroke-width="9" fill="none" />
        <path d="M7 7C14 7 18 25 25 25" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" />
      </svg>
      pretty-git-tree
    </a>
  );
}

export function Masthead({ children }: { children?: ComponentChildren }) {
  return (
    <header class="masthead">
      <div class="brand">
        <Wordmark />
        <span class="tagline">Your work as art.</span>
      </div>
      <div class="masthead-actions">{children}</div>
    </header>
  );
}
