import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_supplier/supplier/settings/")({
	beforeLoad: () => {
		throw redirect({ to: "/supplier/settings/profile" });
	},
});
