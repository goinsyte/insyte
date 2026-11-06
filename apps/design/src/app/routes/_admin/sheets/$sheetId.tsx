import { createFileRoute } from "@tanstack/react-router";
import { SheetEditorPage } from "@insyte/ui/app/sheets/sheet-editor";

export const Route = createFileRoute("/_admin/sheets/$sheetId")({
	component: SheetEditorPage,
});
