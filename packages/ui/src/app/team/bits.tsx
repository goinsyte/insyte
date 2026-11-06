import { Check } from "../../icons";
import { initials } from "../lib/format";
import { personStyle } from "../lib/person-color";
import type { StoreAccess } from "../lib/team";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";

/** The disc that stands in for a person: their colour, their initials. */
export function PersonDisc({ seed, name, size = 24, src }: { seed: string; name: string; size?: number; src?: string }) {
	if (src) return <img src={src} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
	return (
		<span
			aria-hidden
			className={cn("flex shrink-0 items-center justify-center rounded-full font-medium", size >= 40 ? "text-base" : size >= 32 ? "text-sm" : "text-2xs")}
			style={{ ...personStyle(seed), width: size, height: size }}
		>
			{initials(name)}
		</span>
	);
}

/** An address that has not become a person yet: a quiet well with its first letter. */
export function AddressDisc({ email, size = 28 }: { email: string; size?: number }) {
	return (
		<span aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-ink/7 font-medium text-ink-2 text-xs" style={{ width: size, height: size }}>
			{email.slice(0, 1).toUpperCase()}
		</span>
	);
}

const CHIP = "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-sm leading-none transition-colors";

/**
 * Which of the workspace's stores a person may open: all of them (and any connected later), or a
 * pick. The pick can never be empty — choosing none would invite someone into nothing.
 */
export function StoreAccessPicker({ value, onChange }: { value: StoreAccess; onChange: (v: StoreAccess) => void }) {
	const stores = useWorkspace((s) => s.stores);
	const all = value === "all";
	const picked = all ? stores.map((s) => s.id) : value;
	return (
		<div className="flex flex-wrap gap-1.5" role="group" aria-label="Winkels">
			<button type="button" aria-pressed={all} onClick={() => onChange("all")} className={cn(CHIP, all ? "bg-abyss text-mesh-ink" : "field text-ink-2 hover:field-hover hover:text-ink")}>
				{all ? <Check className="size-3.5" strokeWidth={2.25} /> : null}
				Alle winkels
			</button>
			{stores.map((s) => {
				const on = !all && picked.includes(s.id);
				return (
					<button
						key={s.id}
						type="button"
						aria-pressed={on}
						onClick={() => {
							const base = all ? [] : picked;
							const next = base.includes(s.id) ? base.filter((x) => x !== s.id) : [...base, s.id];
							onChange(next.length === 0 || next.length === stores.length ? "all" : next);
						}}
						className={cn(CHIP, on ? "bg-arc-tint text-arc-ink" : "field text-ink-2 hover:field-hover hover:text-ink")}
					>
						{on ? <Check className="size-3.5" strokeWidth={2.25} /> : null}
						{s.name}
					</button>
				);
			})}
		</div>
	);
}

/** A segmented choice on a well: the picked one is paper, the rest sit in the well. */
export function Segmented<T extends string | number>({
	value,
	options,
	onChange,
	label,
}: {
	value: T;
	options: ReadonlyArray<{ id: T; label: string }>;
	onChange: (v: T) => void;
	label: string;
}) {
	return (
		<div role="radiogroup" aria-label={label} className="inline-flex h-9 items-center gap-0.5 rounded-lg bg-ink/5 p-0.5">
			{options.map((o) => (
				<button
					key={String(o.id)}
					type="button"
					role="radio"
					aria-checked={o.id === value}
					onClick={() => onChange(o.id)}
					className={cn(
						"h-8 rounded-md px-3 font-medium text-sm transition-colors",
						o.id === value ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-ink-2 hover:text-ink",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

export const GHOST_BTN =
	"flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-50";
export const PRIMARY_BTN =
	"flex h-9 items-center justify-center gap-1.5 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50";
export const WELL_BTN =
	"field flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 font-medium text-sm text-ink transition-colors hover:field-hover disabled:pointer-events-none disabled:opacity-50";
