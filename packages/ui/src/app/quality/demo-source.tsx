import type { ReactNode } from "react";
import { products, suppliers } from "../../data-source";
import { useMyName } from "../ask/agent-parts";
import { undoable } from "../lib/undo";
import { useGate } from "../stores/access-store";
import { THRESHOLD, useProductQuality, useQuality } from "../stores/quality-store";
import { useWorkspace } from "../stores/workspace-store";
import { QualityAgents } from "./agent-plate";
import { type QualityPicture, type QualitySource, QualitySourceProvider, type Said } from "./source";

/*
 * The Kwaliteit tab over the design app's quality store, as it was before the seam (`source.tsx`): the store's checks,
 * complaints and phases, the access store's gates, its commands with their Undo, the supplier answering in its portal,
 * a ticket on a rejection, and the agents' plate.
 */

const SIZES = ["Klein", "Middel", "Groot"];

const said = (s: Said, undo: () => void) => undoable(s.label, undo, s.detail);

function useDemoPicture(productId: string): QualityPicture {
	const q = useProductQuality(productId);
	const media = useWorkspace((s) => s.productMedia[productId]) ?? [];
	const product = products.find((p) => p.id === productId);
	const supplier = suppliers.find((s) => s.id === product?.supplier_id);
	return { ...q, threshold: THRESHOLD, supplier: supplier ? { id: supplier.id, name: supplier.name } : null, sizes: SIZES, media };
}

export function DemoQualitySource({ children }: { children: ReactNode }) {
	const me = useMyName();
	const source: QualitySource = {
		usePicture: useDemoPicture,
		commands: {
			request: (productId, draft, s) => {
				const supplierId = products.find((p) => p.id === productId)?.supplier_id ?? "";
				const c = useQuality.getState().request({ productId, supplierId, kind: draft.kind, variants: [...draft.variants], deliver: [...draft.deliver], due: draft.due, requestedBy: me, note: draft.note });
				said(s, () => useQuality.getState().cancel(c.id));
			},
			approve: (id, s) => said(s, useQuality.getState().judge(id, true, me)),
			reject: (id, input, s) => {
				const check = useQuality.getState().checks.find((c) => c.id === id);
				const undos = [useQuality.getState().judge(id, false, me, input.reason)];
				if (input.watch && check) undos.push(useQuality.getState().setPhase(check.productId, "watch"));
				let ticketId: string | undefined;
				if (input.ticket && check) {
					const title = products.find((p) => p.id === check.productId)?.title ?? "";
					const supplier = suppliers.find((x) => x.id === check.supplierId)?.name ?? "leverancier";
					ticketId = useWorkspace.getState().createTicket({ title: `${title}: controle afgekeurd bij ${supplier}`, description: input.reason, priority: "high", tags: ["Kwaliteit", "Leverancier"] }).id;
				}
				said(s, () => {
					for (const u of undos) u();
					if (ticketId) useWorkspace.setState((st) => ({ tickets: st.tickets.filter((t) => t.id !== ticketId) }));
				});
			},
			setPhase: (productId, phase, s) => said(s, useQuality.getState().setPhase(productId, phase)),
		},
		gates: { request: useGate("products", 2), judge: useGate("quality.approve"), phase: useGate("products.phase") },
		tickets: true,
		reach: "portal",
		Agents: QualityAgents,
	};
	return <QualitySourceProvider value={source}>{children}</QualitySourceProvider>;
}
