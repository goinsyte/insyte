import { createFileRoute } from "@tanstack/react-router";
import { dataSearch } from "@insyte/ui/app/data/data-search";
import { DataPage } from "@insyte/ui/app/data/data-screen";

export const Route = createFileRoute("/_admin/data")({
	validateSearch: dataSearch,
	component: DataPage,
});
