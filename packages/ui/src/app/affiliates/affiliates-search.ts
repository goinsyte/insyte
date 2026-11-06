/* The search params of `affiliates-screen.tsx`'s route, apart from the screen so the route tree can read them without loading it (ADR-0026). Moved verbatim. */


export type View = "actief" | "aanmeldingen" | "uitbetalingen" | "uitnodigingen";

export const VIEWS: ReadonlyArray<View> = ["actief", "aanmeldingen", "uitbetalingen", "uitnodigingen"];
