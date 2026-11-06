import { createFileRoute } from "@tanstack/react-router";
import { type SheetsSearch, SheetsPage } from "@insyte/ui/app/sheets/sheets-screen";

export const Route = createFileRoute("/_admin/sheets/")({
	validateSearch: (s: Record<string, unknown>): SheetsSearch => ({
		view: typeof s.view === "string" ? s.view : undefined,
		folder: typeof s.folder === "string" ? s.folder : undefined,
	}),
	component: SheetsPage,
});
