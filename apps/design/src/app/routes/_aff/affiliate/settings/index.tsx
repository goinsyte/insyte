import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_aff/affiliate/settings/")({
	beforeLoad: () => {
		throw redirect({ to: "/affiliate/settings/profile" });
	},
});
