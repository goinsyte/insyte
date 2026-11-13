import { createFileRoute } from "@tanstack/react-router";
import { dataSearch } from "@insyte/ui/app/data/data-search";
import { DataPage } from "@insyte/ui/app/data/data-screen";
import { DemoDataSource } from "@insyte/ui/app/data/data-demo-source";

export const Route = createFileRoute("/_admin/data")({
	validateSearch: dataSearch,
	component: DataRoute,
});

function DataRoute() {
	return (
		<DemoDataSource>
			<DataPage />
		</DemoDataSource>
	);
}
