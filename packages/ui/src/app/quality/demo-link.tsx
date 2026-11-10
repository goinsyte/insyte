import { useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { products, suppliers } from "../../data-source";
import { undoable } from "../lib/undo";
import { useQuality } from "../stores/quality-store";
import { type QualityLinkSource, QualityLinkSourceProvider } from "./link-source";

/*
 * The quality link page over the design app's quality store: the check the route names (or the first one still open,
 * for `/kwaliteit/demo`), answered as Marco of Allure Fulfillment, with Undo. An unknown id is a spent link.
 */
export function DemoQualityLink({ children }: { children: ReactNode }) {
	const { checkId } = useParams({ strict: false }) as { checkId?: string };
	const checks = useQuality((s) => s.checks);
	const c = checks.find((x) => x.id === checkId) ?? (checkId === "demo" ? checks.find((x) => x.status === "requested" || x.status === "rejected") : undefined);
	const product = c ? products.find((p) => p.id === c.productId) : undefined;
	const source: QualityLinkSource = {
		check: c && product ? { ...c, productTitle: product.title, productImage: product.images[0], supplierName: suppliers.find((s) => s.id === c.supplierId)?.name ?? "de leverancier" } : null,
		brand: "Northwind",
		send: async (a) => {
			if (!c) return "Deze link werkt niet meer.";
			const undo = useQuality.getState().submit(c.id, { at: new Date().toISOString(), by: "Marco Rossi", photos: a.files.filter((f) => !f.type.startsWith("video/")).map((f) => URL.createObjectURL(f)), video: a.files.some((f) => f.type.startsWith("video/")), batch: a.batch, note: a.note });
			undoable("Controle ingestuurd", undo, "Northwind krijgt een melding en beoordeelt het.");
			return null;
		},
	};
	return <QualityLinkSourceProvider value={source}>{children}</QualityLinkSourceProvider>;
}
