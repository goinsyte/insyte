import { createFileRoute } from "@tanstack/react-router";
import { DemoSheetDoc, DemoSheetsSource } from "@insyte/ui/app/sheets/sheets-demo-source";
import { SheetEditorPage } from "@insyte/ui/app/sheets/sheet-editor";

export const Route = createFileRoute("/_admin/sheets/$sheetId")({
	component: SheetRoute,
});

function SheetRoute() {
	return (
		<DemoSheetsSource>
			<DemoSheetDoc>
				<SheetEditorPage />
			</DemoSheetDoc>
		</DemoSheetsSource>
	);
}
