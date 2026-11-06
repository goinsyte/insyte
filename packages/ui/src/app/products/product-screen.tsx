import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { QualityTab } from "../quality/quality-tab";
import { useProductQuality } from "../stores/quality-store";
import { Check, ExternalLink, ImageOff, Loader, Megaphone, RefreshCcw } from "../../icons";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DetailShell } from "../common/detail-shell";
import { ProductReturns } from "../returns/product-returns";
import { ProductThumb } from "../product/product-thumb";
import { UnsavedBar } from "../settings/form";
import { useProduct } from "../hooks/use-operator-data";
import { categoryOf, marginOf, sellThrough, stockOf, unitsOf } from "../lib/catalog";
import { formatCurrency } from "../lib/format";
import { suppliers } from "../../data-source";
import { AttachmentTile } from "../chats/attachments";
import type { Product } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";

const Route = getRouteApi("/_admin/products/$productId");

export type ProductSearch = { tab?: "quality" | undefined; check?: string | undefined };

/*
 * The product, editable where it is read. Any value with a dotted rule under it is a field: click it
 * and it becomes one, in place, with the margin recalculating as price or cost change. Changes are a
 * draft until the bar at the foot saves them, with Undo, the same bar Settings uses. Shopify stays
 * the system of record — the next sync takes the new values there — and "Open in Shopify" is still
 * one click away for what the console does not edit (media, variants, SEO).
 */
export function ProductDetail() {
	const { productId } = Route.useParams();
	const { data: product, loading } = useProduct(productId);

	if (loading) {
		return (
			<div className="flex items-center justify-center p-10">
				<Loader className="size-5 animate-spin text-ink-3" strokeWidth={2} />
			</div>
		);
	}

	if (!product) {
		return (
			<div className="flex flex-col items-start gap-3 p-6">
				<p className="text-base text-ink-3">Dit product is niet gevonden. Misschien is het nog niet gesynchroniseerd.</p>
				<Link to="/products" className="text-base text-arc-ink hover:underline">
					Terug naar producten
				</Link>
			</div>
		);
	}

	return <ProductEditor product={product} />;
}

type Draft = Pick<Product, "title" | "description" | "price" | "status" | "supplier_id"> & { cost: number | undefined };

const draftOf = (p: Product): Draft => ({
	title: p.title,
	description: p.description,
	price: p.price,
	cost: p.cost,
	status: p.status,
	supplier_id: p.supplier_id,
});

function ProductEditor({ product }: { product: Product }) {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const tab = search.tab ?? "overview";
	const quality = useProductQuality(product.id);
	const orders = useWorkspace((s) => s.orders);
	const adsPaused = useWorkspace((s) => s.productEdits[product.id]?.adsPaused === true);
	const editProducts = useWorkspace((s) => s.editProducts);
	const restore = useWorkspace((s) => s.restoreProducts);
	const [draft, setDraft] = useState<Draft>(() => draftOf(product));
	const [sync, setSync] = useState<"idle" | "syncing" | "done">("idle");

	// A different product, or the saved values changing under the page, resets the draft.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the saved values, not the object
	useEffect(() => setDraft(draftOf(product)), [product.id, product.title, product.description, product.price, product.cost, product.status, product.supplier_id]);

	const saved = draftOf(product);
	const dirty = (Object.keys(saved) as Array<keyof Draft>).some((k) => saved[k] !== draft[k]);
	const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
	const margin = marginOf(draft.price, draft.cost);
	const units = unitsOf(product);
	const pace = sellThrough(product, orders);
	const stock = stockOf(product);
	const supplierMedia = useWorkspace((s) => s.productMedia[product.id]) ?? [];
	const productEditsAll = useWorkspace((s) => s.productEdits);
	const supplier = suppliers.find((s) => s.id === draft.supplier_id);

	async function syncNow() {
		setSync("syncing");
		await new Promise((r) => setTimeout(r, 1100));
		setSync("done");
		toast.success("Product gesynchroniseerd vanuit Shopify", { description: "Prijs, voorraad en varianten zijn bijgewerkt." });
	}

	return (
		<DetailShell
			crumb={{ label: "Producten", to: "/products" }}
			title={<Inline value={draft.title} onChange={set("title")} label="Titel" className="font-medium text-xl text-ink" />}
			meta={
				<>
					{`${categoryOf(draft.title)} · vanaf ${formatCurrency(draft.price)} · ${product.variants.length} ${product.variants.length === 1 ? "variant" : "varianten"}`}
				</>
			}
			actions={
				<>
					<button
						type="button"
						onClick={syncNow}
						disabled={sync === "syncing"}
						className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-ink transition-colors hover:bg-ink/6 disabled:opacity-60"
					>
						{sync === "syncing" ? (
							<Loader className="size-3.5 animate-spin" />
						) : sync === "done" ? (
							<Check className="size-3.5 text-arc-ink" strokeWidth={2.25} />
						) : (
							<RefreshCcw className="size-3.5" />
						)}
						{sync === "syncing" ? "Synchroniseren" : sync === "done" ? "Zojuist gesynchroniseerd" : "Synchroniseren vanuit Shopify"}
					</button>
					<a
						href={`https://admin.shopify.com/products/${product.shopify_id}`}
						target="_blank"
						rel="noopener noreferrer"
						className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-ink transition-colors hover:bg-ink/6"
					>
						Openen in Shopify
						<ExternalLink className="size-3.5" />
					</a>
				</>
			}
		>
			{/* The page's two sections, as the home's view row: a glyph-less label and an arc underline that travels. */}
			<div role="tablist" aria-label="Onderdelen van het product" className="mb-3 flex gap-5 shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_8%,transparent)]">
				{(
					[
						["overview", "Overzicht", null],
						["quality", "Kwaliteit", quality.checks.filter((c) => c.status === "submitted").length || null],
					] as const
				).map(([id, label, n]) => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={tab === id}
						onClick={() => void navigate({ to: ".", search: (prev: ProductSearch) => ({ ...prev, tab: id === "quality" ? "quality" : undefined, check: undefined }), replace: true, state: (st: unknown) => st } as never)}
						className={cn("relative flex h-9 items-center gap-1.5 font-medium text-sm transition-colors", tab === id ? "text-ink" : "text-ink-3 hover:text-ink")}
					>
						{label}
						{id === "quality" && quality.phase === "watch" ? <span className="rounded-sm bg-signal-amber-bg px-1.5 py-px text-signal-amber text-xs">Onder toezicht</span> : null}
						{n ? <span className="rounded-full bg-arc-tint px-1.5 text-arc-ink text-xs tabular-nums">{n}</span> : null}
						{tab === id ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-arc" /> : null}
					</button>
				))}
			</div>

			{tab === "quality" ? <QualityTab product={product} openCheck={search.check} /> : <>
			{adsPaused ? (
				<div className="mb-3 flex items-center gap-2.5 rounded-lg bg-signal-amber-bg px-3.5 py-2.5 text-base text-signal-amber">
					<Megaphone className="size-4 shrink-0" strokeWidth={1.75} />
					<span className="min-w-0 flex-1">Advertenties voor dit product staan op pauze tot het weer op voorraad is.</span>
					<button
						type="button"
						onClick={() => {
							const before = useWorkspace.getState().productEdits;
							editProducts({ [product.id]: { adsPaused: false } });
							undoable(`Advertenties voor ${product.title} hervat`, () => restore(before));
						}}
						className="h-7 cursor-pointer rounded-md px-2.5 font-medium text-sm transition-colors hover:bg-signal-amber/10"
					>
						Advertenties hervatten
					</button>
				</div>
			) : null}

			<div className="grid gap-3 lg:grid-cols-3">
				<div className="flex flex-col gap-3 lg:col-span-2">
					<Gallery images={product.images} title={product.title} />

					<section className="panel flex flex-col gap-2 rounded-lg p-4">
						<span className="font-medium text-xs text-ink-2">Beschrijving</span>
						<Inline
							value={draft.description}
							onChange={set("description")}
							label="Beschrijving"
							multiline
							placeholder="Nog geen beschrijving. Klik om er een te schrijven."
							className="whitespace-pre-line text-base text-ink-2 leading-[1.6]"
						/>
					</section>

					<section className="panel flex flex-col gap-2 rounded-lg p-4">
						<span className="flex items-baseline justify-between font-medium text-xs text-ink-2">
							Varianten · {product.variants.length}
							<span className="font-normal text-ink-3">
								{units} op voorraad
								{pace.daysLeft === null
									? ", niet verkocht in de afgelopen 30 dagen"
									: pace.daysLeft > 365
										? ", meer dan een jaar in het huidige tempo"
										: `, ongeveer ${Math.round(pace.daysLeft)} dagen in het huidige tempo`}
							</span>
						</span>
						<table className="w-full">
							<thead>
								<tr className="text-left">
									<th className="h-8 font-medium text-ink-3 text-xs">Variant</th>
									<th className="h-8 font-medium text-ink-3 text-xs">SKU</th>
									<th className="h-8 text-right font-medium text-ink-3 text-xs">Prijs</th>
									<th className="h-8 text-right font-medium text-ink-3 text-xs">Voorraad</th>
								</tr>
							</thead>
							<tbody>
								{product.variants.map((v) => (
									<tr key={v.id} className="border-ink/7 border-t text-sm">
										<td className="h-9 text-ink">{v.title}</td>
										<td className="h-9 text-ink-3 tabular-nums">{v.sku || "—"}</td>
										<td className="h-9 text-right text-ink-2 tabular-nums">{formatCurrency(v.price)}</td>
										<td className="h-9 text-right tabular-nums">
											{v.inventory_level <= 0 ? (
												<span className="font-medium text-signal-red">Op</span>
											) : (
												<span className={v.inventory_level < 20 ? "font-medium text-signal-amber" : "text-ink-2"}>{v.inventory_level}</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>
				</div>

				<div className="flex flex-col gap-3">
					<ProductReturns productId={product.id} />
					<section className="panel flex flex-col gap-3 rounded-lg p-4">
						<span className="font-medium text-xs text-ink-2">Prijzen</span>
						<dl className="flex flex-col gap-2.5 text-base">
							<Row label="Prijs">
								<Inline value={String(draft.price)} onChange={(v) => set("price")(Number(v) || 0)} label="Prijs" numeric format={(v) => formatCurrency(Number(v))} />
							</Row>
							<Row label="Inkoopprijs">
								<Inline
									value={draft.cost === undefined ? "" : String(draft.cost)}
									onChange={(v) => set("cost")(v === "" ? undefined : Number(v))}
									label="Inkoopprijs"
									numeric
									placeholder="Inkoopprijs toevoegen"
									format={(v) => formatCurrency(Number(v))}
								/>
							</Row>
							<Row label="Marge">
								<span className="flex items-center gap-2">
									<span className="relative block h-1 w-14 overflow-hidden rounded-full bg-ink/10">
										<span className="absolute inset-y-0 left-0 rounded-full bg-arc transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, margin * 100))}%` }} />
									</span>
									<span className={cn("tabular-nums", margin < 0.3 ? "font-medium text-signal-amber" : "text-ink-2")}>
										{draft.cost === undefined ? "—" : `${Math.round(margin * 100)}%`}
									</span>
								</span>
							</Row>
						</dl>
					</section>

					<section className="panel flex flex-col gap-3 rounded-lg p-4">
						<span className="font-medium text-xs text-ink-2">Status en levering</span>
						<dl className="flex flex-col gap-2.5 text-base">
							<Row label="Status">
								<Pick
									value={draft.status}
									label="Status"
									options={[
										{ value: "active", label: "Actief" },
										{ value: "draft", label: "Concept" },
										{ value: "archived", label: "Gearchiveerd" },
									]}
									onChange={(v) => set("status")(v as Product["status"])}
								/>
							</Row>
							<Row label="Leverancier">
								<Pick
									value={draft.supplier_id ?? ""}
									label="Leverancier"
									options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
									onChange={(v) => set("supplier_id")(v)}
								/>
							</Row>
							<Row label="Voorraad">
								<span className={cn("text-ink-2", stock === "out" && "font-medium text-signal-red", stock === "low" && "font-medium text-signal-amber")}>
									{stock === "out" ? "Uitverkocht" : stock === "low" ? "Lage voorraad" : "Op voorraad"}
								</span>
							</Row>
							{supplier && productEditsAll[product.id]?.leadDays !== undefined ? (
								<Row label="Levertijd">
									<span className="text-ink-2 tabular-nums">
										{productEditsAll[product.id]!.leadDays} {productEditsAll[product.id]!.leadDays === 1 ? "dag" : "dagen"} · volgens {supplier.name}
									</span>
								</Row>
							) : null}
							{supplier ? (
								<Row label="Voorraadfeed">
									<span className="text-ink-2">{supplier.stock_indicator === "live" ? "Live van de leverancier" : supplier.stock_indicator === "none" ? "Geen" : "Alleen op voorraad of niet"}</span>
								</Row>
							) : null}
						</dl>
						{supplierMedia.length > 0 ? (
							<div className="flex flex-col gap-2">
								<span className="text-ink-3 text-sm">
									Van {supplier?.name ?? "de leverancier"} · {supplierMedia.length} {supplierMedia.length === 1 ? "bestand" : "bestanden"}
								</span>
								<div className="flex flex-wrap gap-2">
									{supplierMedia.map((m) => (
										<AttachmentTile key={m.id} a={m} />
									))}
								</div>
							</div>
						) : null}
						{product.tags.length > 0 ? (
							<div className="flex flex-wrap gap-1.5">
								{product.tags.map((t) => (
									<span key={t} className="inline-flex h-[20px] items-center rounded-sm bg-ink/6 px-1.5 font-medium text-ink-2 text-xs">
										{t}
									</span>
								))}
							</div>
						) : null}
					</section>
				</div>
			</div>

			</>}

			<UnsavedBar
				visible={dirty}
				onDiscard={() => setDraft(saved)}
				onSave={() => {
					const before = useWorkspace.getState().productEdits;
					editProducts({ [product.id]: draft });
					undoable(`${draft.title} opgeslagen`, () => restore(before), "Shopify neemt de nieuwe waarden over bij de volgende synchronisatie.");
				}}
			/>
		</DetailShell>
	);
}

/**
 * The product's photographs: the one picked, large, with the rest as a strip under it. Without any it
 * is a quiet mist field, since Shopify holds the media and the console only shows it.
 */
function Gallery({ images, title }: { images: ReadonlyArray<string>; title: string }) {
	const [index, setIndex] = useState(0);
	// A different set of photographs starts again at the first; compared by content, not identity.
	const key = images.join(" ");
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the photographs themselves
	useEffect(() => setIndex(0), [key]);
	const current = images[Math.min(index, images.length - 1)];
	return (
		<div className="panel flex flex-col gap-2 overflow-hidden rounded-lg p-2">
			<div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-mist sm:aspect-[16/9]">
				{current ? (
					<img src={current} alt={title} className="h-full w-full object-cover" />
				) : (
					<ImageOff className="size-6 text-ink-3" strokeWidth={1.75} />
				)}
			</div>
			{images.length > 1 ? (
				<div className="flex gap-2">
					{images.map((src, i) => (
						<button
							key={src}
							type="button"
							onClick={() => setIndex(i)}
							aria-label={`Foto ${i + 1} van ${images.length} bekijken`}
							aria-pressed={i === index}
							className={cn(
								"cursor-pointer rounded-md transition-opacity",
								i === index ? "ring-2 ring-arc" : "opacity-70 hover:opacity-100",
							)}
						>
							<ProductThumb src={src} title={`${title}, foto ${i + 1}`} size={64} />
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-h-7 items-center justify-between gap-3">
			<dt className="text-ink-3">{label}</dt>
			<dd className="min-w-0 text-right">{children}</dd>
		</div>
	);
}

/**
 * A value that is also its own field. Read, it is the value with a dotted rule under it; clicked, it
 * is an input of the same size in the same place. Enter or leaving keeps the change, Escape drops it.
 */
function Inline({
	value,
	onChange,
	label,
	multiline = false,
	numeric = false,
	placeholder,
	format,
	className,
}: {
	value: string;
	onChange: (v: string) => void;
	label: string;
	multiline?: boolean;
	numeric?: boolean;
	placeholder?: string;
	format?: (v: string) => string;
	className?: string;
}) {
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(value);
	const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
	useEffect(() => setText(value), [value]);
	useEffect(() => {
		if (editing) ref.current?.select();
	}, [editing]);

	const commit = () => {
		setEditing(false);
		if (text !== value) onChange(numeric ? text.replace(",", ".") : text);
	};
	const keys = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.stopPropagation();
			setText(value);
			setEditing(false);
		} else if (e.key === "Enter" && (!multiline || e.metaKey)) {
			e.preventDefault();
			commit();
		}
	};

	if (editing) {
		const cls = cn("field w-full rounded-md px-2 py-1 text-ink outline-none focus:bg-paper", numeric && "w-28 text-right tabular-nums", className);
		return multiline ? (
			<textarea ref={ref} aria-label={label} value={text} rows={4} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={keys} className={cls} />
		) : (
			<input
				ref={ref}
				aria-label={label}
				value={text}
				inputMode={numeric ? "decimal" : undefined}
				onChange={(e) => setText(e.target.value)}
				onBlur={commit}
				onKeyDown={keys}
				className={cls}
			/>
		);
	}
	return (
		<button
			type="button"
			onClick={() => setEditing(true)}
			title={`${label} bewerken`}
			className={cn(
				"-mx-1 cursor-text rounded-sm px-1 text-left underline decoration-ink/20 decoration-dotted underline-offset-4 transition-colors hover:bg-ink/4 hover:decoration-arc",
				numeric && "tabular-nums",
				value === "" && "text-ink-3",
				className,
			)}
		>
			{value === "" ? placeholder : format ? format(value) : value}
		</button>
	);
}

/** A choice from a short list, read as its value and changed in place with the native select. */
function Pick({
	value,
	label,
	options,
	onChange,
}: {
	value: string;
	label: string;
	options: ReadonlyArray<{ value: string; label: string }>;
	onChange: (v: string) => void;
}) {
	return (
		<select
			aria-label={label}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="-mr-1 max-w-[180px] cursor-pointer truncate rounded-sm bg-transparent px-1 text-right text-ink-2 underline decoration-ink/20 decoration-dotted underline-offset-4 outline-none hover:bg-ink/4 hover:decoration-arc"
		>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	);
}
