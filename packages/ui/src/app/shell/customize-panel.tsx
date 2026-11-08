import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../../components/dialog";
import {
	Check,
	Eye,
	EyeOff,
	GripVertical,
	type IconComponent,
	LayoutList,
	ListFilter,
	Menu,
	Settings,
} from "../../icons";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { WIDGETS } from "../dashboard/widgets";
import { railItemsForPersona } from "../lib/app-shell-config";
import { cn } from "../lib/utils";
import type { WidgetId } from "../stores/home-store";
import { SECTION_LABEL } from "../lib/panel-sections";
import type { Density, PanelSection, ShortcutStyle } from "../stores/panel-store";
import { useHome, useNavStore, usePanel, usePersonaSelection } from "./state";

/**
 * Customize, as ClickUp has it at the foot of its sidebar: one dialog for how the shell is laid
 * out. Four tabs, each a list of the real things it changes —
 *
 *   - **Navigation**, the rail's destinations: drag to reorder, the eye to hide.
 *   - **Home**, which layout the board uses and which widgets are on it.
 *   - **Sections**, the area panel's parts in order, which of them show, and the style the
 *     shortcuts are drawn in.
 *   - **Density**, compact or comfortable rows across the panel and every table.
 *
 * Every change applies as it is made, so the dialog has no Save; closing it is done.
 */

type Tab = "navigation" | "home" | "sections" | "density";
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
	{ id: "navigation", label: "Navigatie" },
	{ id: "home", label: "Start" },
	{ id: "sections", label: "Secties" },
	{ id: "density", label: "Dichtheid" },
];

export function CustomizeButton() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex h-7 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
			>
				<Settings className="size-[13px] text-ink-3" strokeWidth={1.75} />
				Aanpassen
			</button>
			<CustomizeDialog open={open} onOpenChange={setOpen} />
		</>
	);
}

function CustomizeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const [tab, setTab] = useState<Tab>("sections");
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[min(720px,calc(100vh-48px))] flex-col gap-4 sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle>Aanpassen</DialogTitle>
					<DialogDescription>Richt de zijbalk, de rail en Start in zoals jij werkt.</DialogDescription>
				</DialogHeader>
				<div role="tablist" aria-label="Aanpassen" className="grid grid-cols-4 gap-0.5 rounded-lg bg-ink/5 p-0.5">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							role="tab"
							aria-selected={tab === t.id}
							onClick={() => setTab(t.id)}
							className={cn(
								"relative h-8 cursor-pointer rounded-md text-sm transition-colors",
								tab === t.id ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
							)}
						>
							{tab === t.id ? (
								<motion.span
									layoutId="customize-tab"
									className="absolute inset-0 rounded-md bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
									transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
									aria-hidden
								/>
							) : null}
							<span className="relative">{t.label}</span>
						</button>
					))}
				</div>
				<div className="-mx-1 min-h-[360px] overflow-y-auto px-1 pb-1">
					{tab === "navigation" ? <NavigationTab /> : null}
					{tab === "home" ? <HomeTab /> : null}
					{tab === "sections" ? <SectionsTab /> : null}
					{tab === "density" ? <DensityTab /> : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}

/* ─── Navigation ────────────────────────────────────────────────────────── */

function NavigationTab() {
	const { persona } = usePersonaSelection();
	const items = railItemsForPersona(persona);
	const order = useNavStore((s) => s.order);
	const hidden = useNavStore((s) => s.hidden);
	const setOrder = useNavStore((s) => s.setOrder);
	const toggleHidden = useNavStore((s) => s.toggleHidden);
	const keys = items.map((i) => i.to);
	const ordered = order.length === 0 ? keys : [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];

	return (
		<SortableRows
			ids={ordered}
			onMove={setOrder}
			render={(id) => {
				const item = items.find((i) => i.to === id);
				if (!item) return null;
				const off = hidden.includes(id);
				return (
					<RowBody icon={item.icon} label={item.label} muted={off}>
						<IconToggle on={!off} label={off ? `${item.label} tonen` : `${item.label} verbergen`} onClick={() => toggleHidden(id)} />
					</RowBody>
				);
			}}
		/>
	);
}

/* ─── Home ──────────────────────────────────────────────────────────────── */

function HomeTab() {
	const engine = useHome((s) => s.engine);
	const setEngine = useHome((s) => s.setEngine);
	const widgets = useHome((s) => s.widgets);
	const add = useHome((s) => s.add);
	const remove = useHome((s) => s.remove);

	return (
		<div className="flex flex-col gap-5">
			<Group label="Indeling">
				<div className="grid grid-cols-2 gap-2">
					<Choice
						on={engine === "masonry"}
						onClick={() => setEngine("masonry")}
						title="Kolommen"
						hint="Natuurlijke hoogtes, in kolommen gestapeld"
						preview={<MasonryPreview />}
					/>
					<Choice on={engine === "grid"} onClick={() => setEngine("grid")} title="Raster" hint="Vrij plaatsen en schalen" preview={<GridPreview />} />
				</div>
			</Group>
			<Group label="Widgets op Start">
				<ul className="flex flex-col gap-1">
					{(Object.keys(WIDGETS) as WidgetId[]).map((id) => {
						const w = WIDGETS[id];
						const on = widgets.some((x) => x.id === id);
						return (
							<li key={id}>
								<RowBody icon={w.icon} label={w.title} hint={w.blurb} muted={!on}>
									<IconToggle
										on={on}
										label={on ? `${w.title} van Start verwijderen` : `${w.title} aan Start toevoegen`}
										onClick={() => (on ? remove(id) : add(id, w.defaultSize, w.defaultTone))}
									/>
								</RowBody>
							</li>
						);
					})}
				</ul>
			</Group>
		</div>
	);
}

/* ─── Sections ──────────────────────────────────────────────────────────── */

const STYLES: ReadonlyArray<{ id: ShortcutStyle; title: string; hint: string; preview: ReactNode }> = [
	{ id: "ruler", title: "Tijdlijn vandaag", hint: "De dag als een liniaal", preview: <RulerPreview /> },
	{ id: "drawer", title: "Lade", hint: "Eén lijst, drie tabbladen", preview: <DrawerPreview /> },
	{ id: "classic", title: "Klassiek", hint: "Vastgezet en favorieten", preview: <ClassicPreview /> },
];

function SectionsTab() {
	const sections = usePanel((s) => s.sections);
	const hidden = usePanel((s) => s.hidden);
	const setSections = usePanel((s) => s.setSections);
	const toggle = usePanel((s) => s.toggleSection);
	const style = usePanel((s) => s.style);
	const setStyle = usePanel((s) => s.setStyle);
	const shown = sections.filter((s) => !hidden.includes(s));
	const off = sections.filter((s) => hidden.includes(s));

	return (
		<div className="flex flex-col gap-5">
			<Group label="Stijl van snelkoppelingen">
				<div className="grid grid-cols-3 gap-2">
					{STYLES.map((s) => (
						<Choice key={s.id} on={style === s.id} onClick={() => setStyle(s.id)} title={s.title} hint={s.hint} preview={s.preview} />
					))}
				</div>
			</Group>
			<Group label="Secties">
				<SortableRows
					ids={shown}
					onMove={(next) => setSections([...next, ...off] as PanelSection[])}
					render={(id) => {
						const s = SECTION_LABEL[id as PanelSection];
						return (
							<RowBody icon={SECTION_ICON[id as PanelSection]} label={s.label} hint={s.hint}>
								<IconToggle on label={`${s.label} verbergen`} onClick={() => toggle(id as PanelSection)} />
							</RowBody>
						);
					}}
				/>
			</Group>
			<Group label="Verborgen secties">
				{off.length === 0 ? (
					<p className="px-1 text-sm text-ink-3">Alle secties worden getoond.</p>
				) : (
					<ul className="flex flex-col gap-1">
						{off.map((id) => (
							<li key={id}>
								<RowBody icon={SECTION_ICON[id]} label={SECTION_LABEL[id].label} muted>
									<IconToggle on={false} label={`${SECTION_LABEL[id].label} tonen`} onClick={() => toggle(id)} />
								</RowBody>
							</li>
						))}
					</ul>
				)}
			</Group>
		</div>
	);
}

const SECTION_ICON: Record<PanelSection, IconComponent> = { navigation: Menu, report: LayoutList, shortcuts: ListFilter };

/* ─── Density ───────────────────────────────────────────────────────────── */

function DensityTab() {
	const density = usePanel((s) => s.density);
	const setDensity = usePanel((s) => s.setDensity);
	const options: ReadonlyArray<{ id: Density; title: string; hint: string; row: number }> = [
		{ id: "compact", title: "Compact", hint: "Tabelrijen van 36px, 28px in de zijbalk", row: 9 },
		{ id: "comfortable", title: "Ruim", hint: "Tabelrijen van 44px, 32px in de zijbalk", row: 13 },
	];
	return (
		<Group label="Rijhoogte">
			<div className="grid grid-cols-2 gap-2">
				{options.map((o) => (
					<Choice
						key={o.id}
						on={density === o.id}
						onClick={() => setDensity(o.id)}
						title={o.title}
						hint={o.hint}
						preview={
							<div className="flex flex-col gap-0.5">
								{[0, 1, 2, 3].map((i) => (
									<span key={i} className={cn("flex items-center gap-1.5 rounded-sm px-1.5", i % 2 === 0 ? "bg-mist" : "bg-paper")} style={{ height: o.row }}>
										<span className="h-1 w-8 rounded-full bg-ink/15" />
										<span className="ml-auto h-1 w-4 rounded-full bg-ink/10" />
									</span>
								))}
							</div>
						}
					/>
				))}
			</div>
		</Group>
	);
}

/* ─── Parts ─────────────────────────────────────────────────────────────── */

function Group({ label, children }: { label: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-2">
			<h3 className="px-1 font-medium text-xs text-ink-3">{label}</h3>
			{children}
		</section>
	);
}

/** A white row on the dialog's paper is invisible; rows are `mist` wells, as in the reference. */
function RowBody({
	icon: Icon,
	label,
	hint,
	muted = false,
	handle,
	children,
}: {
	icon: IconComponent;
	label: string;
	hint?: string;
	muted?: boolean;
	handle?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className={cn("flex min-h-11 items-center gap-2.5 rounded-lg bg-mist px-2.5 py-1.5", muted && "opacity-60")}>
			{handle}
			<Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-base text-ink">{label}</span>
				{hint ? <span className="truncate text-xs text-ink-3">{hint}</span> : null}
			</span>
			{children}
		</div>
	);
}

function IconToggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			aria-pressed={on}
			className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
		>
			{on ? <Eye className="size-4" strokeWidth={1.75} /> : <EyeOff className="size-4" strokeWidth={1.75} />}
		</button>
	);
}

function Choice({
	on,
	onClick,
	title,
	hint,
	preview,
}: {
	on: boolean;
	onClick: () => void;
	title: string;
	hint: string;
	preview: ReactNode;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={on}
			onClick={onClick}
			className={cn(
				"relative flex cursor-pointer flex-col gap-2 rounded-lg bg-mist p-2.5 text-left transition-shadow",
				on ? "ring-2 ring-arc" : "hover:ring-1 hover:ring-ink/15",
			)}
		>
			<span className="flex h-[72px] flex-col justify-center overflow-hidden rounded-md bg-paper p-2">{preview}</span>
			<span className="flex items-center gap-1.5">
				<span className="font-medium text-sm text-ink">{title}</span>
				{on ? <Check className="ml-auto size-3.5 text-arc-ink" strokeWidth={2.25} /> : null}
			</span>
			<span className="-mt-1.5 text-xs text-ink-3 leading-snug">{hint}</span>
		</button>
	);
}

function SortableRows({
	ids,
	onMove,
	render,
}: {
	ids: ReadonlyArray<string>;
	onMove: (next: string[]) => void;
	render: (id: string) => ReactNode;
}) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);
	function onDragEnd(e: DragEndEvent) {
		if (!e.over || e.active.id === e.over.id) return;
		onMove(arrayMove([...ids], ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
	}
	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
			<SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
				<ul className="flex flex-col gap-1">
					{ids.map((id) => (
						<SortableRow key={id} id={id}>
							{render(id)}
						</SortableRow>
					))}
				</ul>
			</SortableContext>
		</DndContext>
	);
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			className={cn("relative flex items-center", isDragging && "z-10 [&>div]:shadow-[0_12px_28px_-12px_rgb(0_0_0/0.3)]")}
		>
			<button
				type="button"
				ref={setActivatorNodeRef}
				{...attributes}
				{...listeners}
				aria-label="Sleep om te herschikken"
				className="absolute left-1 z-10 flex h-7 w-5 cursor-grab touch-none items-center justify-center text-ink-4 hover:text-ink-2 active:cursor-grabbing"
			>
				<GripVertical className="size-3.5" strokeWidth={1.75} />
			</button>
			<div className="min-w-0 flex-1 [&>div]:pl-7">{children}</div>
		</li>
	);
}

/* ─── Small drawings of each choice ─────────────────────────────────────── */

function MasonryPreview() {
	return (
		<span className="grid h-full grid-cols-3 gap-1">
			<span className="col-span-2 rounded-sm bg-abyss/80" />
			<span className="row-span-2 rounded-sm bg-arc-tint" />
			<span className="rounded-sm bg-ink/8" />
			<span className="rounded-sm bg-ink/8" />
		</span>
	);
}

function GridPreview() {
	return (
		<span className="grid h-full grid-cols-4 grid-rows-3 gap-1">
			<span className="col-span-3 row-span-2 rounded-sm bg-abyss/80" />
			<span className="row-span-3 rounded-sm bg-arc-tint" />
			<span className="rounded-sm bg-ink/8" />
			<span className="col-span-2 rounded-sm bg-ink/8" />
		</span>
	);
}

function RulerPreview() {
	return (
		<span className="relative flex h-full flex-col justify-center gap-1.5 pl-5">
			<span className="absolute top-1 bottom-1 left-3 w-px bg-ink/15" />
			{["bg-ink-4", "bg-arc", "bg-signal-red"].map((c, i) => (
				<span key={c} className="flex items-center gap-1">
					<span className={cn("-ml-2.5 h-[2px] w-1.5", c)} />
					<span className="h-1 rounded-full bg-ink/12" style={{ width: 28 - i * 4 }} />
				</span>
			))}
		</span>
	);
}

function DrawerPreview() {
	return (
		<span className="flex h-full flex-col justify-center gap-1.5">
			<span className="flex gap-1.5">
				<span className="h-1 w-5 rounded-full bg-ink/40" />
				<span className="h-1 w-4 rounded-full bg-ink/12" />
				<span className="h-1 w-4 rounded-full bg-ink/12" />
			</span>
			{[0, 1, 2].map((i) => (
				<span key={i} className="flex items-center gap-1">
					<span className="size-1.5 rounded-[2px] bg-ink/20" />
					<span className="h-1 w-10 rounded-full bg-ink/12" />
				</span>
			))}
		</span>
	);
}

function ClassicPreview() {
	return (
		<span className="flex h-full flex-col justify-center gap-1">
			<span className="flex h-4 items-center gap-1 rounded-sm bg-mist px-1">
				<span className="size-1 rounded-[1px] bg-arc" />
				<span className="h-1 w-8 rounded-full bg-ink/20" />
			</span>
			{[0, 1].map((i) => (
				<span key={i} className="flex items-center gap-1">
					<span className="size-1.5 rounded-[2px] bg-ink/20" />
					<span className="h-1 w-9 rounded-full bg-ink/12" />
				</span>
			))}
		</span>
	);
}
