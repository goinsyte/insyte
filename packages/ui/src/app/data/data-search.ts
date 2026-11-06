/* The search params of `data-screen.tsx`'s route, apart from the screen so the route tree can read them without loading it (ADR-0026). Moved verbatim. */
import { z } from "zod";

/* The sub-panel's links all point here with `?view=`; Overview is the bare URL. */
export const VIEWS = [
	"sheet",
	"import",
	"export",
	"integrations",
	"sync",
	"webhooks",
] as const;

export const dataSearch = z.object({
	view: z.enum(VIEWS).optional().catch(undefined),
});
