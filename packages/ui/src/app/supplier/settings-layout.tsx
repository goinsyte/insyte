import { Outlet, useRouterState } from "@tanstack/react-router";
import { Bell, Building, type IconComponent, Plug } from "../../icons";

const PAGES: Record<string, { title: string; icon: IconComponent }> = {
	profile: { title: "Bedrijfsprofiel", icon: Building },
	"api-connection": { title: "API-koppeling", icon: Plug },
	notifications: { title: "Meldingen", icon: Bell },
};

/** The supplier's settings, on the same grey sheet as the brand's; the area panel is the navigation. */
export function SupplierSettingsLayout() {
	const leaf = useRouterState({ select: (s) => s.location.pathname.split("/").filter(Boolean).at(-1) ?? "" });
	const page = PAGES[leaf] ?? PAGES.profile!;
	const Icon = page.icon;
	return (
		<div className="relative isolate flex min-h-full min-w-0 shrink-0 flex-col bg-paper px-3 py-3 sm:px-5 sm:py-5">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 bg-dot-grid-ink [mask-image:radial-gradient(ellipse_at_center,transparent_35%,black_85%)]"
			/>
			<div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-8 rounded-2xl bg-glacier px-5 pt-6 pb-10 sm:px-10 sm:pt-8">
				<header className="flex items-center gap-3">
					<span className="flex size-9 items-center justify-center rounded-lg bg-paper text-arc-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
						<Icon className="size-[18px]" strokeWidth={1.75} />
					</span>
					<h1 className="font-medium text-2xl text-ink">{page.title}</h1>
				</header>
				<Outlet />
			</div>
		</div>
	);
}
