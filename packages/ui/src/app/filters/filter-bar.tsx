import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "../../components/command";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover";
import {
	Calendar,
	Check,
	ChevronDown,
	Hash,
	type IconComponent,
	ListFilter,
	MoreHorizontal,
	Pin,
	PinOff,
	Plus,
	Save,
	Trash2,
	Type,
	X,
} from "../../icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";
import { Glyph } from "../common/glyph";
import {
	appendTo,
	countRules,
	describeRule,
	emptyGroup,
	type FieldType,
	type FilterField,
	type FilterNode,
	type Group,
	isComplete,
	OPS,
	type Op,
	type Rule,
	ruleFor,
	updateNode,
	VALUELESS,
} from "../lib/filter";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useViews } from "../stores/views-store";

/**
 * Filtering, the way ClickUp does it, kept compact.
 *
 * One **Filter** button opens the builder: rows that read as sentences — "Where Status is any of
 * Delayed, Paid", "and Total is above 100" — with the join switchable between And and Or, rows added
 * and removed in place, and a group for the "(this or that) and the other" a flat list cannot say.
 * The field picker is searchable and says each field's type with its glyph; the operators offered
 * are the ones that type can answer.
 *
 * What is applied stays visible: each rule becomes a small chip under the toolbar, and a chip opens
 * that one rule for editing where it sits. A filter worth keeping is saved as a **view**, a tab over
 * the list that can also be pinned to the sidebar.
 *
 * The facet menus this replaces could only say "is any of" about one column at a time.
 */

const TYPE_ICON: Record<FieldType, IconComponent> = {
	option: ListFilter,
	text: Type,
	number: Hash,
	date: Calendar,
};

type Tone = "light" | "mesh";

/* ─── The button and the builder ────────────────────────────────────────── */

export function FilterButton<T>({
	fields,
	rows,
	value,
	onChange,
	onSaveView,
	tone = "light",
}: {
	fields: ReadonlyArray<FilterField<T>>;
	rows: ReadonlyArray<T>;
	value: Group;
	onChange: (g: Group) => void;
	/** Offered in the builder's foot when the list keeps views. */
	onSaveView?: (name: string) => void;
	tone?: Tone;
}) {
	const n = countRules(value);
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"glyph-host flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium text-sm transition-colors",
						tone === "mesh"
							? n > 0
								? "bg-white/16 text-mesh-ink"
								: "text-mesh-ink-2 hover:bg-white/10 hover:text-mesh-ink"
							: n > 0
								? "bg-arc-tint text-arc-ink"
								: "text-ink-2 hover:bg-ink/6 hover:text-ink",
					)}
				>
					<Glyph icon={ListFilter} size={14} draw={false} />
					Filter
					{n > 0 ? (
						<span
							className={cn(
								"flex h-4 min-w-4 items-center justify-center rounded-[4px] px-1 text-2xs tabular-nums",
								tone === "mesh" ? "bg-paper text-ink" : "bg-arc text-mesh-ink",
							)}
						>
							{n}
						</span>
					) : null}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[min(620px,calc(100vw-24px))] p-0">
				<Builder fields={fields} rows={rows} value={value} onChange={onChange} onSaveView={onSaveView} />
			</PopoverContent>
		</Popover>
	);
}

function Builder<T>({
	fields,
	rows,
	value,
	onChange,
	onSaveView,
}: {
	fields: ReadonlyArray<FilterField<T>>;
	rows: ReadonlyArray<T>;
	value: Group;
	onChange: (g: Group) => void;
	onSaveView?: ((name: string) => void) | undefined;
}) {
	const [naming, setNaming] = useState<string | null>(null);
	const empty = value.children.length === 0;

	return (
		<div className="flex flex-col">
			<header className="flex h-10 items-center gap-2 px-3">
				<span className="font-medium text-base text-ink">Filters</span>
				{!empty ? (
					<button
						type="button"
						onClick={() => onChange(emptyGroup(value.join))}
						className="ml-auto h-7 cursor-pointer rounded-md px-2 font-medium text-xs text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						Alles wissen
					</button>
				) : null}
			</header>

			<div className="flex flex-col gap-1 px-3 pb-2">
				{empty ? (
					<p className="pb-1 text-sm text-ink-3">Nog geen filters. Alle rijen worden getoond.</p>
				) : (
					<GroupRows group={value} root={value} fields={fields} rows={rows} onChange={onChange} depth={0} />
				)}
			</div>

			<footer className="flex items-center gap-1 rounded-b-xl bg-mist px-2 py-1.5">
				<FieldPicker
					fields={fields}
					onPick={(f) => onChange(appendTo(value, value.id, ruleFor(f)))}
					trigger={
						<button type="button" className={FOOT_BUTTON}>
							<Plus className="size-3.5" strokeWidth={2} />
							Filter toevoegen
						</button>
					}
				/>
				<FieldPicker
					fields={fields}
					onPick={(f) =>
						onChange(appendTo(value, value.id, { ...emptyGroup("or"), children: [ruleFor(f)] }))
					}
					trigger={
						<button type="button" className={FOOT_BUTTON}>
							<Plus className="size-3.5" strokeWidth={2} />
							Groep toevoegen
						</button>
					}
				/>
				{onSaveView !== undefined && countRules(value) > 0 ? (
					naming === null ? (
						<button type="button" onClick={() => setNaming("")} className={cn(FOOT_BUTTON, "ml-auto text-arc-ink")}>
							<Save className="size-3.5" strokeWidth={1.75} />
							Opslaan als weergave
						</button>
					) : (
						<form
							className="ml-auto flex items-center gap-1"
							onSubmit={(e) => {
								e.preventDefault();
								const name = naming.trim();
								if (name === "") return;
								onSaveView(name);
								setNaming(null);
							}}
						>
							<input
								// biome-ignore lint/a11y/noAutofocus: the field appears because the operator asked to name the view
								autoFocus
								value={naming}
								onChange={(e) => setNaming(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Escape") {
										e.stopPropagation();
										setNaming(null);
									}
								}}
								placeholder="Geef deze weergave een naam"
								aria-label="Naam van weergave"
								className="field h-7 w-44 rounded-md bg-paper px-2 text-sm text-ink outline-none placeholder:text-ink-3"
							/>
							<button
								type="submit"
								className="h-7 cursor-pointer rounded-md bg-abyss px-2.5 font-medium text-sm text-mesh-ink hover:bg-abyss-2"
							>
								Opslaan
							</button>
						</form>
					)
				) : null}
			</footer>
		</div>
	);
}

const FOOT_BUTTON =
	"flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 font-medium text-sm text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink";

function GroupRows<T>({
	group,
	root,
	fields,
	rows,
	onChange,
	depth,
}: {
	group: Group;
	root: Group;
	fields: ReadonlyArray<FilterField<T>>;
	rows: ReadonlyArray<T>;
	onChange: (g: Group) => void;
	depth: number;
}) {
	const still = useReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{group.children.map((child, i) => (
				<motion.div
					key={child.id}
					layout={still ? false : "position"}
					initial={still ? false : { opacity: 0, y: -4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, transition: { duration: 0.1 } }}
					transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
					className="flex items-start gap-1.5"
				>
					<Join
						index={i}
						join={group.join}
						onToggle={() => onChange(updateNode(root, group.id, (g) => (g.kind === "group" ? { ...g, join: g.join === "and" ? "or" : "and" } : g)))}
					/>
					{child.kind === "rule" ? (
						<RuleRow
							rule={child}
							fields={fields}
							rows={rows}
							onChange={(r) => onChange(updateNode(root, child.id, () => r))}
							onRemove={() => onChange(updateNode(root, child.id, () => null))}
						/>
					) : (
						<div className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg bg-mist p-1.5">
							<GroupRows group={child} root={root} fields={fields} rows={rows} onChange={onChange} depth={depth + 1} />
							<div className="flex items-center gap-1">
								<FieldPicker
									fields={fields}
									onPick={(f) => onChange(appendTo(root, child.id, ruleFor(f)))}
									trigger={
										<button type="button" className={cn(FOOT_BUTTON, "h-6 text-xs")}>
											<Plus className="size-3" strokeWidth={2} />
											Toevoegen aan groep
										</button>
									}
								/>
								<button
									type="button"
									onClick={() => onChange(updateNode(root, child.id, () => null))}
									className={cn(FOOT_BUTTON, "ml-auto h-6 text-xs hover:bg-signal-red-bg hover:text-signal-red")}
								>
									Groep verwijderen
								</button>
							</div>
						</div>
					)}
				</motion.div>
			))}
		</AnimatePresence>
	);
}

/** "Where" on the first row; the join on the second, where it can be switched; the join's word after. */
function Join({ index, join, onToggle }: { index: number; join: "and" | "or"; onToggle: () => void }) {
	const label = index === 0 ? "Waar" : join === "and" ? "En" : "Of";
	if (index !== 1) {
		return <span className="flex h-8 w-14 shrink-0 items-center px-1 text-sm text-ink-3">{label}</span>;
	}
	return (
		<button
			type="button"
			onClick={onToggle}
			title="Wissel tussen alle regels en een van de regels"
			className="flex h-8 w-14 shrink-0 cursor-pointer items-center justify-between rounded-md px-1.5 font-medium text-sm text-arc-ink transition-colors hover:bg-arc-tint"
		>
			{label}
			<ChevronDown className="size-3" strokeWidth={2} />
		</button>
	);
}

function RuleRow<T>({
	rule,
	fields,
	rows,
	onChange,
	onRemove,
}: {
	rule: Rule;
	fields: ReadonlyArray<FilterField<T>>;
	rows: ReadonlyArray<T>;
	onChange: (r: Rule) => void;
	onRemove: () => void;
}) {
	const field = fields.find((f) => f.id === rule.field);
	if (field === undefined) return null;
	const ops = OPS[field.type];
	const opLabel = ops.find((o) => o.op === rule.op)?.label ?? rule.op;

	return (
		<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
			<FieldPicker
				fields={fields}
				onPick={(f) => onChange(f.id === rule.field ? rule : { ...ruleFor(f), id: rule.id })}
				trigger={
					<button type="button" className={cn(WELL, "w-[132px]")}>
						<Glyph icon={TYPE_ICON[field.type]} size={13} draw={false} className="text-ink-3" />
						<span className="min-w-0 flex-1 truncate text-left">{field.label}</span>
						<ChevronDown className="size-3 text-ink-3" strokeWidth={2} />
					</button>
				}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button type="button" className={cn(WELL, "w-[118px]")}>
						<span className="min-w-0 flex-1 truncate text-left">{opLabel}</span>
						<ChevronDown className="size-3 text-ink-3" strokeWidth={2} />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-44">
					{ops.map((o) => (
						<DropdownMenuItem
							key={o.op}
							onClick={() => onChange({ ...rule, op: o.op, value: retype(rule.value, field.type, o.op) })}
						>
							<span className="flex-1">{o.label}</span>
							{o.op === rule.op ? <Check className="size-3.5 text-arc-ink" strokeWidth={2} /> : null}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			{VALUELESS.has(rule.op) ? null : (
				<ValueEditor rule={rule} field={field} rows={rows} onChange={(value) => onChange({ ...rule, value })} />
			)}
			<button
				type="button"
				onClick={onRemove}
				aria-label={`Filter ${field.label} verwijderen`}
				className="ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
			>
				<X className="size-3.5" strokeWidth={2} />
			</button>
		</div>
	);
}

const WELL =
	"flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-ink/5 px-2 text-sm text-ink transition-colors hover:bg-ink/8";

/** Picking an operator of another shape resets the value to that shape. */
function retype(value: Rule["value"], type: FieldType, op: Op): Rule["value"] {
	if (type === "option") return Array.isArray(value) ? value : [];
	if (op === "last_days") return Array.isArray(value) ? "7" : value || "7";
	return Array.isArray(value) ? "" : value;
}

function ValueEditor<T>({
	rule,
	field,
	rows,
	onChange,
}: {
	rule: Rule;
	field: FilterField<T>;
	rows: ReadonlyArray<T>;
	onChange: (v: Rule["value"]) => void;
}) {
	if (field.type === "option") {
		return <OptionPicker field={field} rows={rows} value={Array.isArray(rule.value) ? rule.value : []} onChange={onChange} />;
	}
	const text = Array.isArray(rule.value) ? "" : rule.value;
	if (field.type === "date" && rule.op === "last_days") {
		return (
			<label className={cn(WELL, "w-[150px] cursor-text")}>
				<input
					type="number"
					min={1}
					value={text}
					onChange={(e) => onChange(e.target.value)}
					className="w-10 min-w-0 flex-1 bg-transparent tabular-nums outline-none"
					aria-label="Aantal dagen"
				/>
				<span className="text-ink-3">dagen</span>
			</label>
		);
	}
	return (
		<input
			type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
			value={text}
			onChange={(e) => onChange(e.target.value)}
			placeholder={field.type === "number" ? "0" : "Typ een waarde"}
			aria-label={`Waarde voor ${field.label}`}
			className={cn(WELL, "min-w-[150px] flex-1 cursor-text tabular-nums outline-none placeholder:text-ink-3 focus:bg-paper focus:ring-1 focus:ring-arc")}
		/>
	);
}

function OptionPicker<T>({
	field,
	rows,
	value,
	onChange,
}: {
	field: FilterField<T>;
	rows: ReadonlyArray<T>;
	value: ReadonlyArray<string>;
	onChange: (v: ReadonlyArray<string>) => void;
}) {
	const counts = useMemo(() => {
		const m = new Map<string, number>();
		for (const r of rows) {
			const k = String(field.get(r));
			m.set(k, (m.get(k) ?? 0) + 1);
		}
		return m;
	}, [rows, field]);
	const options = field.options ?? [...counts.keys()].map((v) => ({ value: v, label: v }));
	const labels = value.map((v) => options.find((o) => o.value === v)?.label ?? v);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button type="button" className={cn(WELL, "min-w-[150px] flex-1")}>
					<span className={cn("min-w-0 flex-1 truncate text-left", labels.length === 0 && "text-ink-3")}>
						{labels.length === 0 ? "Kies waarden" : labels.join(", ")}
					</span>
					{labels.length > 1 ? <span className="text-xs text-ink-3 tabular-nums">{labels.length}</span> : null}
					<ChevronDown className="size-3 text-ink-3" strokeWidth={2} />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command>
					<CommandInput placeholder={`Zoek in ${field.label.toLowerCase()}`} />
					<CommandList className="max-h-64">
						<CommandEmpty>Geen resultaat.</CommandEmpty>
						<CommandGroup>
							{options.map((o) => {
								const on = value.includes(o.value);
								return (
									<CommandItem
										key={o.value}
										value={o.label}
										onSelect={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
									>
										<span
											className={cn(
												"flex size-3.5 shrink-0 items-center justify-center rounded-[4px] transition-colors",
												on ? "bg-arc text-mesh-ink" : "ring-1 ring-ink/25",
											)}
										>
											{on ? <Check className="size-2.5" strokeWidth={3} /> : null}
										</span>
										<span className="min-w-0 flex-1 truncate">{o.label}</span>
										<span className="text-xs text-ink-3 tabular-nums">{counts.get(o.value) ?? 0}</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function FieldPicker<T>({
	fields,
	onPick,
	trigger,
}: {
	fields: ReadonlyArray<FilterField<T>>;
	onPick: (f: FilterField<T>) => void;
	trigger: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-0">
				<Command>
					<CommandInput placeholder="Filteren op" />
					<CommandList className="max-h-72">
						<CommandEmpty>Geen veld met die naam.</CommandEmpty>
						<CommandGroup>
							{fields.map((f) => (
								<CommandItem
									key={f.id}
									value={f.label}
									onSelect={() => {
										onPick(f);
										setOpen(false);
									}}
									className="glyph-host"
								>
									<Glyph icon={TYPE_ICON[f.type]} size={14} draw={false} motion="pop" className="text-ink-3" />
									<span className="flex-1">{f.label}</span>
									<span className="text-2xs text-ink-3">{TYPE_LABEL[f.type]}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

const TYPE_LABEL: Record<FieldType, string> = { option: "Optie", text: "Tekst", number: "Getal", date: "Datum" };

/* ─── Chips ─────────────────────────────────────────────────────────────── */

/**
 * What is applied, as one small chip per rule under the toolbar. A chip opens its own rule where it
 * sits; its X takes it off. A group is one chip that opens the group.
 */
export function FilterChips<T>({
	fields,
	rows,
	value,
	onChange,
	tone = "light",
	className,
}: {
	fields: ReadonlyArray<FilterField<T>>;
	rows: ReadonlyArray<T>;
	value: Group;
	onChange: (g: Group) => void;
	tone?: Tone;
	className?: string;
}) {
	const still = useReducedMotion();
	const live = value.children.filter((c) => (c.kind === "rule" ? isComplete(c) : countRules(c) > 0));
	if (live.length === 0) return null;

	return (
		<div className={cn("flex flex-wrap items-center gap-1", className)}>
			<AnimatePresence initial={false}>
				{live.map((node, i) => (
					<motion.div
						key={node.id}
						layout={still ? false : "position"}
						initial={still ? false : { opacity: 0, scale: 0.92 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.1 } }}
						transition={{ type: "spring", stiffness: 600, damping: 36 }}
						className="flex items-center gap-1"
					>
						{i > 0 ? (
							<span className={cn("px-0.5 text-xs", tone === "mesh" ? "text-mesh-ink-3" : "text-ink-3")}>
								{value.join === "and" ? "en" : "of"}
							</span>
						) : null}
						<Chip node={node} root={value} fields={fields} rows={rows} onChange={onChange} tone={tone} />
					</motion.div>
				))}
			</AnimatePresence>
			<button
				type="button"
				onClick={() => onChange(emptyGroup(value.join))}
				className={cn(
					"h-6 cursor-pointer rounded-sm px-1.5 font-medium text-xs transition-colors",
					tone === "mesh" ? "text-mesh-ink-3 hover:bg-white/10 hover:text-mesh-ink" : "text-ink-3 hover:bg-ink/6 hover:text-ink",
				)}
			>
				Wissen
			</button>
		</div>
	);
}

function Chip<T>({
	node,
	root,
	fields,
	rows,
	onChange,
	tone,
}: {
	node: FilterNode;
	root: Group;
	fields: ReadonlyArray<FilterField<T>>;
	rows: ReadonlyArray<T>;
	onChange: (g: Group) => void;
	tone: Tone;
}) {
	const remove = () => onChange(updateNode(root, node.id, () => null));
	const face =
		node.kind === "rule"
			? describeRule(node, fields)
			: { field: "Groep", op: node.join === "and" ? "voldoet aan alle" : "voldoet aan een van", value: `${countRules(node)} ${countRules(node) === 1 ? "regel" : "regels"}` };
	const icon = node.kind === "rule" ? TYPE_ICON[fields.find((f) => f.id === node.field)?.type ?? "text"] : ListFilter;

	return (
		<span
			className={cn(
				"flex h-6 items-center overflow-hidden rounded-sm text-xs",
				tone === "mesh" ? "bg-white/14 text-mesh-ink" : "bg-arc-tint text-arc-ink",
			)}
		>
			<Popover>
				<PopoverTrigger asChild>
					<button type="button" className="flex h-full cursor-pointer items-center gap-1 pr-1 pl-1.5 transition-colors hover:bg-ink/6">
						<Glyph icon={icon} size={12} draw={false} />
						<span className="font-medium">{face.field}</span>
						<span className="opacity-75">{face.op}</span>
						{face.value ? <span className="max-w-[180px] truncate font-medium">{face.value}</span> : null}
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-[min(560px,calc(100vw-24px))] p-2">
					{node.kind === "rule" ? (
						<RuleRow
							rule={node}
							fields={fields}
							rows={rows}
							onChange={(r) => onChange(updateNode(root, node.id, () => r))}
							onRemove={remove}
						/>
					) : (
						<div className="flex flex-col gap-1">
							<GroupRows group={node} root={root} fields={fields} rows={rows} onChange={onChange} depth={1} />
						</div>
					)}
				</PopoverContent>
			</Popover>
			<button
				type="button"
				onClick={remove}
				aria-label={`Filter ${face.field} verwijderen`}
				className="flex h-full w-5 cursor-pointer items-center justify-center transition-colors hover:bg-ink/8"
			>
				<X className="size-3" strokeWidth={2} />
			</button>
		</span>
	);
}

/* ─── Saved views ───────────────────────────────────────────────────────── */

/**
 * The views over a list, as tabs: "All" and every filter the operator saved. Changing the filter of
 * a view offers to keep the change; a view can be renamed, pinned to the sidebar or deleted with Undo.
 */
export function ViewTabs({
	viewKey,
	allLabel,
	value,
	onPick,
}: {
	viewKey: string;
	allLabel: string;
	value: Group;
	onPick: (filter: Group) => void;
}) {
	const views = useViews((s) => s.views[viewKey]) ?? NONE;
	const active = useViews((s) => s.active[viewKey] ?? null);
	const setActive = useViews((s) => s.setActive);
	const update = useViews((s) => s.update);
	const remove = useViews((s) => s.remove);
	const restore = useViews((s) => s.restore);
	const togglePin = useViews((s) => s.togglePin);
	const current = views.find((v) => v.id === active);
	const changed = current !== undefined && JSON.stringify(current.filter) !== JSON.stringify(value);

	if (views.length === 0) return null;

	const tab = (id: string | null, label: string, pinned = false) => {
		const on = id === active;
		return (
			<button
				key={id ?? "all"}
				type="button"
				role="tab"
				aria-selected={on}
				onClick={() => {
					setActive(viewKey, id);
					onPick(id === null ? emptyGroup() : (views.find((v) => v.id === id)?.filter ?? emptyGroup()));
				}}
				className={cn(
					"relative flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors",
					on ? "font-medium text-ink" : "text-ink-2 hover:bg-ink/6 hover:text-ink",
				)}
			>
				{on ? (
					<motion.span
						layoutId={`view-tab-${viewKey}`}
						className="absolute inset-0 rounded-md bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.07)]"
						transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
						aria-hidden
					/>
				) : null}
				{pinned ? <Pin className="relative size-3 text-arc-ink" strokeWidth={1.75} /> : null}
				<span className="relative">{label}</span>
			</button>
		);
	};

	return (
		<div className="flex flex-wrap items-center gap-1">
			<div role="tablist" aria-label="Weergaven" className="flex flex-wrap items-center gap-0.5 rounded-lg bg-ink/5 p-0.5">
				{tab(null, allLabel)}
				{views.map((v) => tab(v.id, v.name, v.pinned))}
			</div>
			{changed && current ? (
				<button
					type="button"
					onClick={() => update(viewKey, current.id, value)}
					className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 font-medium text-sm text-arc-ink transition-colors hover:bg-arc-tint"
				>
					<Save className="size-3.5" strokeWidth={1.75} />
					Wijzigingen opslaan in {current.name}
				</button>
			) : null}
			{current ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={`Opties voor ${current.name}`}
							className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
						>
							<MoreHorizontal className="size-4" strokeWidth={1.75} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-48">
						<DropdownMenuItem onClick={() => togglePin(viewKey, current.id)}>
							{current.pinned ? <PinOff className="size-3.5" strokeWidth={1.75} /> : <Pin className="size-3.5" strokeWidth={1.75} />}
							{current.pinned ? "Losmaken van zijbalk" : "Vastzetten in zijbalk"}
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							onClick={() => {
								const gone = remove(viewKey, current.id);
								onPick(emptyGroup());
								if (gone) undoable(`Weergave “${gone.name}” verwijderd`, () => restore(viewKey, gone));
							}}
						>
							<Trash2 className="size-3.5" strokeWidth={1.75} />
							Weergave verwijderen
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</div>
	);
}

const NONE: never[] = [];
