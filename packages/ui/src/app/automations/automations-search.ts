/* The search params of `automations-screen.tsx`'s route, apart from the screen so the route tree can read them without loading it (ADR-0026). Moved verbatim. */


/* ─────────────────────────────────────────────────────────────────────
   Automations — the last screen still speaking the generated dialect.

   It was the only one of the ten that had never been converted at all:
   `text-muted-foreground`, `border-border`, `bg-muted`, a `Card` wrapper,
   an underlined tab strip, and every chip and pager button drawn with a
   1px border. Those slot names resolve through the shadcn compatibility
   block, so it rendered — just in a different design system from the
   nine screens beside it.

   It now says what the other list screens say, because it IS what they
   are: the same `DataTable`, the same facets, the same density.
   ───────────────────────────────────────────────────────────────────── */

export const VIEWS = ["drafts", "ai", "history", "templates", "recommended"] as const;
