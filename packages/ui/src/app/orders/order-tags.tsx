import { Plus, X } from "../../icons";
import { useMemo, useRef, useState } from "react";
import { isSystemTag, normaliseTag, tagLabel } from "../lib/order-tags";
import type { Order } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";

/**
 * An order's tags, edited where they are read. The operator's own tags carry an X; typing in the
 * well adds one, with the tags other orders already use offered as you type, so the same word is not
 * spelled three ways. Each change applies at once and offers Undo, the way every reversible change
 * in the console does. Insyte's own markers sit beside them as quieter chips and are not editable
 * here; they change through the action that set them.
 */
export function OrderTags({ order }: { order: Order }) {
	const orders = useWorkspace((s) => s.orders);
	const [draft, setDraft] = useState("");
	const [focused, setFocused] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const own = order.tags.filter((t) => !isSystemTag(t));
	const system = order.tags.filter(isSystemTag);

	const known = useMemo(
		() => [...new Set(orders.flatMap((o) => o.tags).filter((t) => !isSystemTag(t)))].sort(),
		[orders],
	);
	const q = normaliseTag(draft);
	const suggestions = known.filter((t) => !own.includes(t) && (q === "" || t.includes(q))).slice(0, 6);

	const write = (tags: string[], message: string) => {
		const before = order.tags;
		useWorkspace.setState((s) => ({ orders: s.orders.map((o) => (o.id === order.id ? { ...o, tags, updated_at: new Date().toISOString() } : o)) }));
		undoable(message, () =>
			useWorkspace.setState((s) => ({ orders: s.orders.map((o) => (o.id === order.id ? { ...o, tags: before } : o)) })),
		);
	};
	const add = (raw: string) => {
		const t = normaliseTag(raw);
		if (t === "" || isSystemTag(t) || order.tags.includes(t)) return;
		write([...order.tags, t], `Label “${t}” toegevoegd aan ${order.number}`);
		setDraft("");
		input.current?.focus();
	};

	return (
		<section className="flex flex-col gap-3 rounded-xl panel p-5">
			<h3 className="font-normal text-base text-ink-2 leading-[1.55]">Labels</h3>
			<div className="flex flex-wrap gap-1.5">
				{system.map((t) => (
					<span key={t} title="Gezet door Insyte" className="inline-flex h-7 items-center rounded-md bg-ink/5 px-2 text-sm text-ink-3">
						{tagLabel(t)}
					</span>
				))}
				{own.map((t) => (
					<span key={t} className="group/tag inline-flex h-7 items-center gap-1 rounded-md bg-arc-tint pr-1 pl-2 font-medium text-arc-ink text-sm">
						{t}
						<button
							type="button"
							onClick={() => write(order.tags.filter((x) => x !== t), `“${t}” verwijderd van ${order.number}`)}
							aria-label={`${t} verwijderen`}
							className="flex size-5 cursor-pointer items-center justify-center rounded-sm transition-colors hover:bg-arc/15"
						>
							<X className="size-3" strokeWidth={2.25} />
						</button>
					</span>
				))}
			</div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					add(draft);
				}}
				className="field flex h-9 items-center gap-2 rounded-md px-2.5 focus-within:bg-paper"
			>
				<Plus className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} />
				<input
					ref={input}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onFocus={() => setFocused(true)}
					onBlur={() => window.setTimeout(() => setFocused(false), 120)}
					placeholder="Label toevoegen"
					aria-label="Label toevoegen"
					className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
				/>
			</form>
			{focused && suggestions.length > 0 ? (
				<div className="-mt-1 flex flex-wrap gap-1" aria-label="Labels die andere bestellingen gebruiken">
					{suggestions.map((t) => (
						<button
							key={t}
							type="button"
							onMouseDown={(e) => {
								e.preventDefault();
								add(t);
							}}
							className={cn("h-6 cursor-pointer rounded-sm bg-mist px-1.5 text-xs text-ink-2 transition-colors hover:bg-ink/8 hover:text-ink")}
						>
							{t}
						</button>
					))}
				</div>
			) : null}
		</section>
	);
}
