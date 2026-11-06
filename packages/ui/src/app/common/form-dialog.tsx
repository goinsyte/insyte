import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { ChevronDown } from "../../icons";
import { cn } from "../lib/utils";

export function FormDialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	primaryLabel,
	onSubmit,
	disabled,
	width = 560,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	title: string;
	description?: string;
	children: React.ReactNode;
	primaryLabel: string;
	onSubmit: () => void;
	disabled?: boolean;
	width?: number;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent style={{ maxWidth: width }}>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>
				<div className="flex flex-col gap-4">{children}</div>
				<DialogFooter className="gap-2">
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="flex h-9 items-center justify-center rounded-lg px-3.5 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						Annuleren
					</button>
					<button
						type="button"
						onClick={onSubmit}
						disabled={disabled}
						className="flex h-9 items-center justify-center gap-2 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{primaryLabel}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/*
 * Form field primitives — the canonical /login input pattern, applied everywhere.
 *
 * The aesthetic: white tile, single 1px hairline ring at rest, Arc 1px + 3px
 * Arc-Soft halo on focus. No drop shadow. No hover-grow. Flat by default.
 *
 * Surface theming via CSS variables on a parent:
 *   --field-label, --field-hint (label/hint text on mesh surfaces flip white)
 * Inputs themselves stay white per "Inputs do NOT change fill on mesh".
 */

export function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: label wraps the field control passed via children
		<label className="flex flex-col gap-1.5">
			<span
				className="font-medium text-sm leading-none tracking-[-0.05px]"
				style={{ color: "var(--field-label, var(--ink-3))" }}
			>
				{label}
			</span>
			{children}
			{hint ? (
				<span
					className="font-medium text-xs leading-[1.45]"
					style={{ color: "var(--ink-3)" }}
				>
					{hint}
				</span>
			) : null}
		</label>
	);
}

/*
 * /login-canonical input: h-11, rounded-lg, white tile, 1px hairline ring,
 * Arc + Arc-Soft focus halo. No drop shadow. No hover-grow.
 */
/* Filled, not outlined, and no focus ring of its own: `app.css` draws one arc outline on everything
   focusable in the document, which is why this string used to end in two empty concatenations. */
const FIELD_BASE = "field w-full rounded-lg px-3.5 text-base leading-none text-ink outline-none hover:field-hover";

export function TextField({
	value,
	onChange,
	placeholder,
	type = "text",
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	type?: string;
}) {
	return (
		<input
			type={type}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className={cn(FIELD_BASE, "h-11")}
		/>
	);
}

export function TextAreaField({
	value,
	onChange,
	placeholder,
	rows = 3,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	rows?: number;
}) {
	return (
		<textarea
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			rows={rows}
			className={cn(FIELD_BASE, "py-2.5 leading-[1.55]")}
		/>
	);
}

export function SelectField<T extends string>({
	value,
	onChange,
	options,
	renderLabel,
}: {
	value: T;
	onChange: (v: T) => void;
	options: ReadonlyArray<T>;
	renderLabel?: (v: T) => string;
}) {
	const label = renderLabel ? renderLabel(value) : String(value);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						FIELD_BASE,
						"flex h-11 items-center justify-between text-left font-medium",
					)}
				>
					<span className="truncate">{label}</span>
					<ChevronDown className="size-4 text-ink-3" strokeWidth={1.75} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-[var(--anchor-width)]">
				{options.map((o) => (
					<DropdownMenuItem key={o} onClick={() => onChange(o)}>
						{renderLabel ? renderLabel(o) : String(o)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function ChipGroup<T extends string>({
	value,
	options,
	onToggle,
}: {
	value: T[];
	options: ReadonlyArray<{ id: T; label: string }>;
	onToggle: (id: T) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{options.map((o) => {
				const active = value.includes(o.id);
				return (
					<button
						key={o.id}
						type="button"
						onClick={() => onToggle(o.id)}
						className={cn(
							"inline-flex h-7 items-center gap-1 rounded-md px-2.5 font-medium text-sm leading-none transition-colors",
							active
								? "bg-abyss text-mesh-ink"
								: "bg-paper text-ink-3 hover:bg-mist hover:text-ink",
						)}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}
