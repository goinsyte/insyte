import { Check, type IconComponent } from "../../icons";
import {
	createContext,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useContext,
	useId,
	useMemo,
} from "react";
import { cn } from "../lib/utils";

/* ─────────────────────────────────────────────────────────────────────
   <SelectionTile> + <SelectionGroup>

   A brand-correct multi/single-select tile primitive for onboarding.

   Visual recipe (matches DESIGN.md §4 Tile rules):
     - bg-mist (paper variant), no border, no shadow
     - ring-active on selected (the brand book's sanctioned exception
       for "active selection on a tile")
     - icon left, label + hint center, right slot for radio/check + meta

   Group handles aria roles, keyboard nav, and value plumbing.
   ───────────────────────────────────────────────────────────────────── */

type Mode = "single" | "multi";

type GroupCtx = {
	mode: Mode;
	value: string | string[] | null;
	onChange: (id: string) => void;
	registerTile: (id: string) => void;
	groupId: string;
	disabled?: boolean;
};

const Ctx = createContext<GroupCtx | null>(null);

function useGroup() {
	const ctx = useContext(Ctx);
	if (!ctx) {
		throw new Error("SelectionTile must render inside <SelectionGroup>");
	}
	return ctx;
}

export function SelectionGroup({
	mode,
	value,
	onChange,
	columns = 1,
	disabled,
	label,
	children,
	className,
}: {
	mode: Mode;
	value: string | string[] | null;
	onChange: (next: string | string[]) => void;
	columns?: 1 | 2;
	disabled?: boolean;
	/** Visually hidden group label, surfaced to screen readers. */
	label?: string;
	children: ReactNode;
	className?: string;
}) {
	const groupId = useId();

	// We register tile ids in the order they mount so arrow-nav works
	// even when tiles are conditionally rendered.
	const tileOrder = useMemo(() => [] as string[], []);
	const registerTile = useCallback(
		(id: string) => {
			if (!tileOrder.includes(id)) tileOrder.push(id);
		},
		[tileOrder],
	);

	const onTileChange = useCallback(
		(id: string) => {
			if (disabled) return;
			if (mode === "single") {
				onChange(id);
				return;
			}
			const current = Array.isArray(value) ? value : [];
			const next = current.includes(id)
				? current.filter((v) => v !== id)
				: [...current, id];
			onChange(next);
		},
		[disabled, mode, onChange, value],
	);

	const ctx = useMemo<GroupCtx>(
		() => ({
			mode,
			value,
			onChange: onTileChange,
			registerTile,
			groupId,
			disabled,
		}),
		[mode, value, onTileChange, registerTile, groupId, disabled],
	);

	const cols =
		columns === 2
			? "grid grid-cols-1 gap-2.5 sm:grid-cols-2"
			: "flex flex-col gap-2.5";

	return (
		<Ctx.Provider value={ctx}>
			{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label is valid for both radiogroup and group roles */}
			<div
				role={mode === "single" ? "radiogroup" : "group"}
				aria-label={label}
				className={cn(cols, className)}
			>
				{children}
			</div>
		</Ctx.Provider>
	);
}

export function SelectionTile({
	id,
	icon: Icon,
	label,
	hint,
	meta,
	disabled,
	onActivate,
}: {
	id: string;
	icon?: IconComponent;
	label: ReactNode;
	hint?: ReactNode;
	/** Right-slot content (price, badge, custom). Renders before the
	    selection indicator. */
	meta?: ReactNode;
	disabled?: boolean;
	/** Called whenever the tile is activated (selected or toggled).
	    Useful when a tile should also trigger a side effect, like
	    kicking off an OAuth flow on Shopify-connect. */
	onActivate?: () => void;
}) {
	const ctx = useGroup();
	const selected =
		ctx.mode === "single"
			? ctx.value === id
			: Array.isArray(ctx.value) && ctx.value.includes(id);
	const isDisabled = disabled || ctx.disabled;

	const handleClick = () => {
		if (isDisabled) return;
		ctx.onChange(id);
		onActivate?.();
	};

	const handleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
		if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			handleClick();
		}
	};

	const role = ctx.mode === "single" ? "radio" : "checkbox";

	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-checked is valid for both radio and checkbox roles
		<button
			type="button"
			role={role}
			aria-checked={selected}
			aria-disabled={isDisabled || undefined}
			tabIndex={isDisabled ? -1 : 0}
			disabled={isDisabled}
			onClick={handleClick}
			onKeyDown={handleKey}
			className={cn(
				/* White on the grey ground, like /login's fields. Selection is the arc ring and a wash of
				   arc behind the icon, not a coloured drop shadow. */
				"group/tile relative flex cursor-pointer items-center gap-3 rounded-xl bg-paper p-3 text-left transition-[box-shadow,background-color] duration-150",
				"hover:ring-1 hover:ring-ink/12",
				selected && "ring-2 ring-arc hover:ring-arc",
				isDisabled && "cursor-not-allowed opacity-50",
			)}
		>
			{Icon ? (
				<span
					className={cn(
						"flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
						selected ? "bg-arc-tint text-arc-ink" : "bg-mist text-ink-2 group-hover/tile:text-arc-ink",
					)}
					aria-hidden
				>
					<Icon className="size-4" strokeWidth={1.75} />
				</span>
			) : null}

			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-medium text-base text-ink leading-snug">
					{label}
				</span>
				{hint ? (
					<span className="line-clamp-2 text-sm text-ink-2 leading-snug">
						{hint}
					</span>
				) : null}
			</div>

			{meta ? <div className="shrink-0">{meta}</div> : null}

			<SelectionIndicator mode={ctx.mode} selected={selected} />
		</button>
	);
}

function SelectionIndicator({
	mode,
	selected,
}: {
	mode: Mode;
	selected: boolean;
}) {
	// Single-select: filled circle with check on selected, empty ring otherwise.
	// Multi-select: filled rounded-square with check on selected, empty otherwise.
	const isMulti = mode === "multi";
	return (
		<span
			className={cn(
				"flex size-5 shrink-0 items-center justify-center transition-all",
				isMulti ? "rounded-[5px]" : "rounded-full",
				selected
					? "bg-arc text-mesh-ink"
					: "bg-paper text-transparent ring-1 ring-ink/20",
			)}
			aria-hidden
		>
			<Check
				className={cn(
					"size-3 transition-transform ease-out",
					selected ? "scale-100" : "scale-50",
				)}
				strokeWidth={2.5}
			/>
		</span>
	);
}
