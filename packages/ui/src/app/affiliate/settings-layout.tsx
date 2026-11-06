import { Card } from "../../components/card";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "../common/page-header";
import { cn } from "../lib/utils";

const NAV = [
	{ to: "/affiliate/settings/profile", label: "Profiel" },
	{ to: "/affiliate/settings/payment", label: "Betaling" },
];

export function AffiliateSettingsLayout() {
	const pathname = useRouterState().location.pathname;
	return (
		<div>
			<PageHeader title="Instellingen" />
			<div className="grid gap-3 p-6 lg:grid-cols-[200px_1fr]">
				<Card className="h-fit p-2">
					<ul className="flex flex-col gap-0.5 font-medium text-xs">
						{NAV.map((n) => (
							<li key={n.to}>
								<Link
									to={n.to}
									className={cn(
										"flex rounded-md px-2 py-1.5 hover:bg-muted",
										pathname === n.to && "bg-muted font-medium",
									)}
								>
									{n.label}
								</Link>
							</li>
						))}
					</ul>
				</Card>
				<Outlet />
			</div>
		</div>
	);
}
