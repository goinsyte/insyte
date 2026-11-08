/* The search params of `onboarding-screen.tsx`'s route, apart from the screen so the route tree can read them without loading it (ADR-0026). Moved verbatim; Shopify's way back added (M6.2). */
import { z } from "zod";

export const search = z.object({
	persona: z.enum(["admin", "supplier", "affiliate"]).optional(),
	step: z.number().int().min(0).optional(),
	// Back from Shopify's approval page (the console, M6.2): connected, or why not.
	connected: z.literal("shopify").optional(),
	store: z.string().optional(),
	error: z.string().optional(),
});
