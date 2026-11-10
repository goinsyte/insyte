import type { ReactNode } from "react";
import { Inbox } from "../../icons";
import { Glyph } from "../common/glyph";
import { MeshGround } from "./mesh-ground";

/**
 * "Je wachtrij" as a card on its own, framed as the home board frames it (the mesh tone): for a host that shows the
 * queue before it has the board (the console's Start, M10.1). The body is `useQueuePanel`'s.
 */
export function QueueCard({ children }: { children: ReactNode }) {
	return (
		<article aria-label="Je wachtrij" className="glyph-host widget-mesh relative isolate flex flex-col gap-3 overflow-hidden rounded-xl bg-stripe-mesh-dark p-4 text-mesh-ink">
			<MeshGround />
			<header className="relative z-10 flex h-7 shrink-0 items-center gap-2">
				<Glyph icon={Inbox} tile="mesh" size={14} draw={false} />
				<h2 className="min-w-0 flex-1 truncate font-medium text-md text-mesh-ink">Je wachtrij</h2>
			</header>
			<div className="relative z-10 min-h-0 flex-1">{children}</div>
		</article>
	);
}
