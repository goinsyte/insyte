# Insyte's mark, as a file

`insyte-mark-white.svg` is `InsyteMark` from `packages/ui/src/brand/mark.tsx` (which points at
`MarkDrift` in `marks.tsx`, ported byte-for-byte from the legacy brand kit) at `tone="white"`,
rendered to static SVG with `renderToStaticMarkup` at 64px. It is the mark exactly as the console
draws it in its rail, on its sign-in page and in onboarding: white on abyss. Only the gradient's
generated id was renamed so it cannot collide on the page; geometry, layers and colours are unchanged.

A file rather than the component because the brand kit is a port, typechecked in its own project
(`packages/ui/tsconfig.ported.json`), and the landing page's strict project may not pull it in.

On paper the landing page sets this same white mark on an `abyss` tile, the way the console shows
it on its rail, rather than the brand-tone variant (`tone="brand"`), which the product does not use
in its chrome. Regenerated on 31 October 2026 (the brand-tone file of 28 October was removed).
