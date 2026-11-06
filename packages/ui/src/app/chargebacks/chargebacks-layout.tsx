import { Outlet, useRouterState } from "@tanstack/react-router";
import { useOpenedAsModal } from "../common/detail-shell";
import { ChargebacksPage } from "./chargebacks-screen";

/**
 * The list lives here rather than in `index.tsx`, so that opening a record does not unmount it.
 *
 * See `routes/_admin/orders/route.tsx` for why: the route under the overlay has to be the same
 * React tree it was a moment ago, filters and scroll position included. A record reached by URL
 * rather than by click has no list to go back to, so the detail renders as a page and this
 * returns null.
 */
export function ChargebacksLayout() {
	const asModal = useOpenedAsModal();
	const atIndex = useRouterState({
		select: (s) => s.location.pathname.replace(/\/$/, "") === "/chargebacks",
	});
	return (
		<>
			{atIndex || asModal ? <ChargebacksPage /> : null}
			<Outlet />
		</>
	);
}
