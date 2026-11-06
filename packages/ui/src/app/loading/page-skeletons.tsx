import { cn } from "../lib/utils";
import { Arriving, Bone, Control, Disc, Figure, Line, Lines, Pill, run } from "./bones";
import type { SkeletonKind } from "./kinds";

/*
 * One skeleton per KIND of screen, not per screen (ADR-0028).
 *
 * Fifty-odd routes share about a dozen shapes — a queue, a board, a conversation, a document, a
 * settings sheet — and a skeleton is only worth drawing if it is the shape the screen will take, so
 * that nothing moves when the data lands. Each one below is measured off the screen it stands in for:
 * the same paddings, the same row heights, the same columns hiding at the same widths.
 */

export function PageSkeleton({ kind, title }: { kind: SkeletonKind; title?: string }) {
	const Body = BODIES[kind];
	return (
		<Arriving label={title ? `${title} laden` : "Laden"} className="flex min-h-full min-w-0 flex-1 flex-col">
			<Body title={title} />
		</Arriving>
	);
}

/* ─── Shared pieces ─────────────────────────────────────────────────────── */

/** The page header as `PageHeader` draws it: the name is known, the count is not. */
function Head({ title, action = 132, className }: { title?: string; action?: number | null; className?: string }) {
	return (
		<header className={cn("flex min-h-[52px] items-center gap-3 px-5 py-2.5", className)}>
			{title ? <h1 className="truncate font-medium text-lg text-ink">{title}</h1> : <Bone className="h-[14px] w-32 rounded-full" />}
			<Bone className="hidden h-[8px] w-44 rounded-full sm:block" />
			{action ? (
				<div className="ml-auto">
					<Control w={action} />
				</div>
			) : null}
		</header>
	);
}

/** Search and filter, above a list. */
function Toolbar() {
	return (
		<div className="flex items-center gap-2 py-3">
			<Control w={208} />
			<Control w={72} />
			<div className="ml-auto hidden items-center gap-2 sm:flex">
				<Control w={96} />
				<Control w={92} />
			</div>
		</div>
	);
}

/* Eight columns after the checkbox, as the orders queue has them; the sixth is the status pill. */
const CELL = [0.62, 0.86, 0.7, 0.16, 0.5, 0, 0.84, 0.66] as const;

/** A queue's rows, banded as `BandedList` bands them. */
function Rows({ n = 12, seed = 0 }: { n?: number; seed?: number }) {
	return (
		<div className="flex flex-col">
			<div className="grid h-9 grid-cols-[28px_1fr_1.2fr_1fr] items-center gap-4 px-2 md:grid-cols-[28px_1fr_1.2fr_1fr_0.5fr_0.8fr_1fr_1.1fr_1fr]">
				<span />
				{CELL.map((w, i) => (
					<Bone key={i} className={cn("h-[7px] rounded-full opacity-70", i > 2 && "hidden md:block")} style={{ width: `${Math.max(30, w * 60)}%` }} />
				))}
			</div>
			{Array.from({ length: n }, (_, r) => (
				<div
					key={r}
					className={cn(
						"grid h-9 grid-cols-[28px_1fr_1.2fr_1fr] items-center gap-4 rounded-md px-2 md:grid-cols-[28px_1fr_1.2fr_1fr_0.5fr_0.8fr_1fr_1.1fr_1fr]",
						r % 2 === 0 && "bg-ink/[0.028]",
					)}
				>
					<Bone className="size-4 rounded-[4px] opacity-70" />
					{CELL.map((w, i) =>
						i === 5 ? (
							<span key={i} className="hidden md:block">
								<Pill w={56 + ((r * 7 + seed) % 4) * 10} />
							</span>
						) : (
							<span key={i} className={cn(i > 2 && "hidden md:block")}>
								<Bone className="h-[9px] rounded-full" style={{ width: `${Math.round(w * (0.7 + ((r * 13 + i * 5 + seed) % 7) * 0.06) * 100)}%` }} />
							</span>
						),
					)}
				</div>
			))}
		</div>
	);
}

/** A paper block on glacier, the board's card. */
function Block({ className, children, tone = "paper" }: { className?: string; children?: React.ReactNode; tone?: "paper" | "tint" }) {
	return <div className={cn("flex flex-col gap-3 rounded-xl p-4", tone === "paper" ? "bg-paper" : "bg-arc-tint/60", className)}>{children}</div>;
}

/** A block's header: its glyph and its name. */
function BlockHead({ w = 132 }: { w?: number }) {
	return (
		<div className="flex h-7 items-center gap-2">
			<Bone className="size-[22px] rounded-md" />
			<Bone className="h-[11px] rounded-full" style={{ width: w }} />
		</div>
	);
}

/** A list inside a block: a disc, two lines, a time. */
function Entries({ n = 4, seed = 0, disc = true }: { n?: number; seed?: number; disc?: boolean }) {
	return (
		<div className="flex flex-col gap-3.5">
			{Array.from({ length: n }, (_, i) => (
				<div key={i} className="flex items-start gap-3">
					{disc ? <Disc size={28} /> : null}
					<div className="flex min-w-0 flex-1 flex-col">
						<Line w={run(seed + i, 1.02)} />
						<Line w={run(seed + i + 4, 0.7)} className="opacity-70" />
					</div>
					<Bone className="mt-1.5 h-[8px] w-10 rounded-full" />
				</div>
			))}
		</div>
	);
}

/** A plate being drawn: abyss, the drafting grid, the scanning rule, chalk bones. */
function PlateBones({ rows = 6, className }: { rows?: number; className?: string }) {
	return (
		<div className={cn("plate relative flex flex-col gap-3 overflow-hidden rounded-xl p-4", className)}>
			<span className="plate-scan" aria-hidden />
			<div className="flex h-7 items-center gap-2">
				<Bone plate className="size-[22px] rounded-md" />
				<Bone plate className="h-[11px] w-28 rounded-full" />
			</div>
			<div className="flex items-center gap-2">
				<Control plate w={118} h={28} />
				<Control plate w={88} h={28} />
				<Control plate w={64} h={28} />
			</div>
			<div className="-mx-4 flex flex-col">
				{Array.from({ length: rows }, (_, i) => (
					<div key={i} className={cn("flex h-[34px] items-center gap-3.5 px-4", i % 2 === 0 && "bg-white/[0.05]")}>
						<Bone plate className="size-[7px] rounded-full" />
						<Bone plate className="h-[9px] rounded-full" style={{ width: run(i, 0.62) }} />
						<span className="flex-1" />
						<Bone plate className="hidden h-[9px] w-20 rounded-full md:block" />
						<Bone plate className="hidden h-[9px] w-14 rounded-full sm:block" />
						<Bone plate className="h-[9px] w-10 rounded-full" />
					</div>
				))}
			</div>
		</div>
	);
}

/** The KPI strip: six cells, each a label, a figure and a sparkline's room. Exported for the pulse. */
export function KpiStrip({ n = 6 }: { n?: number }) {
	return (
		<div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-paper px-4 py-3.5 sm:grid-cols-3 lg:grid-cols-6">
			{Array.from({ length: n }, (_, i) => (
				<div key={i} className={cn("flex flex-col gap-2", i >= 4 && "hidden lg:flex", i >= 2 && i < 4 && "hidden sm:flex")}>
					<div className="flex items-center justify-between">
						<Bone className="h-[8px] w-16 rounded-full" />
						<Pill w={40} />
					</div>
					<div className="flex items-end justify-between">
						<Figure w={84 + (i % 3) * 12} h={18} />
						<Bone className="h-4 w-12 rounded-sm opacity-70" />
					</div>
				</div>
			))}
		</div>
	);
}

/* ─── The kinds ─────────────────────────────────────────────────────────── */

function TableSkeleton({ title }: { title?: string }) {
	return (
		<>
			<Head title={title} />
			<div className="min-w-0 px-5 pb-6">
				<Toolbar />
				<Rows />
			</div>
		</>
	);
}

/* The board's columns are the ticket statuses: configuration, not data, so they are drawn as text. */
const COLUMNS = [
	{ label: "Nieuw", cards: 3 },
	{ label: "Bezig", cards: 2 },
	{ label: "Wacht op antwoord", cards: 2 },
	{ label: "Klaar · vandaag", cards: 1 },
] as const;

function BoardSkeleton(_: { title?: string }) {
	return (
		<>
			<Head title="Alle tickets" action={136} />
			<div className="px-5 pt-3 pb-6">
				<Control w={72} />
				<div className="mt-5 grid gap-3 overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
					{COLUMNS.map((col, c) => (
						<div key={col.label} className={cn("flex flex-col gap-3", c >= 2 && "hidden xl:flex", c === 1 && "hidden sm:flex")}>
							<div className="flex h-7 items-center gap-2 px-1.5">
								<span className="font-medium text-ink text-md">{col.label}</span>
								<Bone className="h-[8px] w-4 rounded-full" />
							</div>
							{Array.from({ length: col.cards }, (_, i) => (
								<div key={i} className="hairline flex flex-col gap-3 rounded-xl bg-paper p-4">
									<div className="flex items-center justify-between">
										<Bone className="h-[9px] w-20 rounded-full" />
										<Pill w={72} />
									</div>
									<Lines n={2} seed={c * 3 + i} />
									<Line w={run(c + i + 5, 0.66)} className="opacity-70" />
									<div className="flex gap-1.5">
										<Pill w={104} />
										<Pill w={72} />
									</div>
									<div className="flex items-center justify-between">
										<div className="flex -space-x-1">
											<Disc size={18} />
											<Disc size={18} />
										</div>
										<Bone className="h-[8px] w-14 rounded-full" />
									</div>
								</div>
							))}
						</div>
					))}
				</div>
			</div>
		</>
	);
}

/** A message in a conversation, on the side its author sits. */
function Bubble({ mine, seed, lines = 1 }: { mine: boolean; seed: number; lines?: number }) {
	return (
		<div className={cn("flex flex-col gap-1.5", mine ? "items-end" : "items-start")}>
			<Bone className="h-[8px] w-24 rounded-full" />
			<div className={cn("flex w-[min(460px,80%)] flex-col rounded-xl px-3.5 py-2.5", mine ? "bg-arc-tint/70" : "bg-mist")}>
				<Lines n={lines} seed={seed} />
			</div>
		</div>
	);
}

function SplitSkeleton() {
	return (
		<div className="flex min-h-0 flex-1">
			<div className="flex w-full flex-col gap-1 md:w-[340px] md:shrink-0">
				<div className="flex h-12 items-center gap-2 px-5">
					<Bone className="h-[11px] w-28 rounded-full" />
					<span className="flex-1" />
					<Bone className="size-5 rounded-md" />
					<Bone className="size-5 rounded-md" />
				</div>
				{Array.from({ length: 7 }, (_, i) => (
					<div key={i} className="flex flex-col gap-1 px-5 py-2.5">
						<div className="flex items-center justify-between">
							<Bone className="h-[10px] rounded-full" style={{ width: run(i, 0.42) }} />
							<Bone className="h-[8px] w-9 rounded-full" />
						</div>
						<Line w={run(i + 3, 0.84)} />
						<Line w={run(i + 6, 0.96)} className="opacity-70" />
						<Pill w={88 + (i % 3) * 18} />
					</div>
				))}
			</div>
			<div className="hidden min-w-0 flex-1 flex-col bg-paper md:flex">
				<div className="flex h-12 items-center gap-3 px-6">
					<Bone className="size-4 rounded-md" />
					<Bone className="h-[9px] w-28 rounded-full" />
					<span className="flex-1" />
					<Control w={92} h={28} />
					<Control w={124} h={28} />
				</div>
				<div className="flex flex-1 flex-col gap-5 px-6 pt-4">
					<Bubble mine={false} seed={1} />
					<Bubble mine seed={2} />
					<Bubble mine={false} seed={3} />
					<Bubble mine seed={4} lines={2} />
				</div>
				<div className="px-4 pb-4">
					<Bone className="h-[58px] w-full rounded-lg" />
				</div>
			</div>
		</div>
	);
}

function ChannelSkeleton() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex h-14 items-center gap-3 px-5">
				<Bone className="size-7 rounded-md" />
				<Bone className="h-[11px] w-36 rounded-full" />
				<Bone className="hidden h-[8px] w-48 rounded-full sm:block" />
				<span className="flex-1" />
				<div className="flex -space-x-1">
					<Disc size={20} />
					<Disc size={20} />
					<Disc size={20} />
				</div>
			</div>
			<div className="flex flex-1 flex-col gap-6 px-5 pt-4">
				{[2, 1, 1, 2].map((n, i) => (
					<div key={i} className="flex gap-3">
						<Bone className="size-8 rounded-lg" />
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<div className="flex items-center gap-2">
								<Bone className="h-[10px] w-20 rounded-full" />
								<Bone className="h-[8px] w-9 rounded-full opacity-70" />
							</div>
							<Lines n={n} seed={i * 2} className="max-w-[760px]" />
							{i === 0 ? (
								<div className="hairline mt-2 flex h-[56px] w-[min(460px,100%)] items-center gap-3 rounded-xl bg-paper px-3">
									<Bone className="size-8 rounded-lg" />
									<div className="flex flex-1 flex-col">
										<Line w="60%" />
										<Line w="30%" className="opacity-70" />
									</div>
									<Bone className="h-[9px] w-14 rounded-full" />
								</div>
							) : null}
						</div>
					</div>
				))}
			</div>
			<div className="p-4">
				<Bone className="h-[108px] w-full rounded-xl" />
			</div>
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<section className="min-h-full bg-glacier px-4 pt-5 pb-12 sm:px-6">
			<div className="flex flex-col gap-3">
				<Bone className="h-[30px] w-[min(320px,80%)] rounded-lg" />
				<div className="flex flex-wrap gap-x-6 gap-y-2">
					<Bone className="h-[12px] w-64 rounded-full" />
					<Bone className="hidden h-[9px] w-52 rounded-full md:block" />
					<Bone className="hidden h-[9px] w-48 rounded-full lg:block" />
				</div>
				<div className="flex items-center gap-2 pt-1">
					<Control w={104} />
					<Control w={98} />
					<Control w={88} />
					<span className="flex-1" />
					<Control w={150} />
				</div>
			</div>
			<div className="mt-4 flex flex-col gap-4">
				<KpiStrip />
				<div className="grid gap-4 lg:grid-cols-3">
					<PlateBones className="lg:col-span-2" />
					<Block>
						<BlockHead w={124} />
						<Entries n={6} seed={2} disc={false} />
					</Block>
				</div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					<Block>
						<BlockHead w={180} />
						<Entries n={3} />
					</Block>
					<Block>
						<BlockHead w={128} />
						<Entries n={3} seed={4} />
					</Block>
					<Block tone="tint" className="hidden lg:flex">
						<BlockHead w={116} />
						<Entries n={3} seed={7} disc={false} />
					</Block>
				</div>
			</div>
		</section>
	);
}

function OverviewSkeleton({ title }: { title?: string }) {
	return (
		<>
			<Head title={title} action={null} />
			<div className="flex flex-col gap-4 px-5 pb-6">
				<KpiStrip n={4} />
				<div className="grid gap-4 lg:grid-cols-2">
					<Block className="hairline">
						<BlockHead />
						<Entries n={5} disc={false} />
					</Block>
					<Block className="hairline">
						<BlockHead w={110} />
						<Entries n={5} seed={3} />
					</Block>
				</div>
			</div>
		</>
	);
}

/** A chart's ground: the gridlines the axis will hang from, and the line not yet drawn. */
export function ChartBones({ className }: { className?: string }) {
	return (
		<div aria-hidden className={cn("relative h-full min-h-[120px] w-full", className)}>
			<div className="absolute inset-y-2 left-10 right-2 flex flex-col justify-between">
				{Array.from({ length: 5 }, (_, i) => (
					<span key={i} className="h-px w-full bg-ink/[0.07]" />
				))}
			</div>
			<div className="absolute inset-y-2 left-0 flex w-8 flex-col justify-between">
				{Array.from({ length: 5 }, (_, i) => (
					<Bone key={i} className="h-[7px] w-7 rounded-full" />
				))}
			</div>
			<Bone className="absolute right-2 bottom-2 left-10 h-[38%] rounded-md opacity-60" />
		</div>
	);
}

function AnalyticsSkeleton() {
	return (
		<div className="mx-auto w-full max-w-[1180px] px-5 pt-8 pb-10">
			<div className="plate relative flex flex-col gap-6 overflow-hidden rounded-2xl p-7">
				<span className="plate-scan" aria-hidden />
				<div className="flex flex-col gap-3">
					<Bone plate className="h-[18px] w-28 rounded-full" />
					<Bone plate className="h-[10px] w-72 rounded-full" />
				</div>
				<div className="grid grid-cols-2 gap-6 pt-4 sm:grid-cols-3 lg:grid-cols-6">
					{Array.from({ length: 6 }, (_, i) => (
						<div key={i} className={cn("flex flex-col gap-3", i >= 2 && "hidden sm:flex", i >= 3 && "sm:hidden lg:flex")}>
							<Bone plate className="h-[9px] w-20 rounded-full" />
							<Figure plate w={110 - (i % 3) * 14} h={30} />
							<Bone plate className="h-[16px] w-24 rounded-md" />
						</div>
					))}
				</div>
			</div>
			<div className="mt-10 flex gap-10">
				<div className="hidden w-[232px] shrink-0 flex-col gap-2 lg:flex">
					<Bone className="mb-2 h-[10px] w-32 rounded-full" />
					{Array.from({ length: 6 }, (_, i) => (
						<div key={i} className="flex h-7 items-center gap-3 px-2">
							<Bone className="h-[8px] w-3 rounded-full" />
							<Bone className="h-[9px] rounded-full" style={{ width: run(i, 0.6) }} />
						</div>
					))}
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-4">
					<Bone className="h-[8px] w-20 rounded-full" />
					<Bone className="h-[14px] w-[78%] rounded-full" />
					<Bone className="h-[14px] w-[52%] rounded-full" />
					<div className="mt-2 h-[200px]">
						<ChartBones />
					</div>
				</div>
			</div>
		</div>
	);
}

function SettingsSkeleton() {
	return (
		<div className="bg-dot-grid-ink min-h-full px-3 pt-5 pb-10 sm:px-5">
			<div className="mx-auto flex max-w-[1120px] flex-col gap-8 rounded-2xl bg-paper px-5 py-8 sm:px-10">
				<div className="flex items-center gap-3">
					<Bone className="size-9 rounded-lg" />
					<Bone className="h-[18px] w-32 rounded-full" />
				</div>
				{[5, 2].map((rows, s) => (
					<div key={s} className="flex flex-col gap-4">
						<div className="flex items-center gap-2">
							<Bone className="size-4 rounded-sm" />
							<Bone className="h-[11px] w-28 rounded-full" />
						</div>
						{Array.from({ length: rows }, (_, i) => (
							<div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
								<Bone className="h-[9px] rounded-full sm:w-[232px]" style={{ width: `${88 + ((i * 29 + s) % 5) * 12}px` }} />
								<Bone className="h-9 w-full max-w-[380px] rounded-md" />
							</div>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * A record's body: the main column (what happened, what is in it) and the facts beside it. Exported:
 * `DetailShell` draws it under a header that has already arrived with the row the operator clicked.
 */
export function RecordBody() {
	return (
		<Arriving label="Gegevens laden" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
			<div className="flex min-w-0 flex-col gap-4">
				<Block className="hairline">
					<BlockHead w={96} />
					{Array.from({ length: 3 }, (_, i) => (
						<div key={i} className="flex items-center gap-3">
							<Bone className="size-10 rounded-lg" />
							<div className="flex min-w-0 flex-1 flex-col">
								<Line w={run(i, 0.7)} />
								<Line w={run(i + 5, 0.4)} className="opacity-70" />
							</div>
							<Bone className="h-[10px] w-14 rounded-full" />
						</div>
					))}
				</Block>
				<Block className="hairline">
					<BlockHead w={120} />
					<div className="relative flex flex-col gap-4 pl-5">
						<span className="absolute top-1 bottom-1 left-[3px] w-px bg-ink/10" aria-hidden />
						{Array.from({ length: 4 }, (_, i) => (
							<div key={i} className="flex flex-col">
								<Line w={run(i + 2, 0.8)} />
								<Line w={run(i + 7, 0.36)} className="opacity-70" />
							</div>
						))}
					</div>
				</Block>
			</div>
			<Block className="hairline self-start">
				<BlockHead w={84} />
				{Array.from({ length: 6 }, (_, i) => (
					<div key={i} className="flex items-center justify-between gap-4">
						<Bone className="h-[9px] w-20 rounded-full opacity-70" />
						<Bone className="h-[9px] rounded-full" style={{ width: `${70 + ((i * 37) % 5) * 14}px` }} />
					</div>
				))}
			</Block>
		</Arriving>
	);
}

function DocumentSkeleton({ title }: { title?: string }) {
	return (
		<>
			<header className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
				{title ? <span className="font-medium text-sm text-ink-3">{title}</span> : null}
				<Bone className="h-[14px] w-36 rounded-full" />
				<Pill w={72} />
				<div className="ml-auto flex gap-1.5">
					<Control w={96} />
					<Control w={32} />
				</div>
			</header>
			<div className="px-5 pb-6">
				<RecordBody />
			</div>
		</>
	);
}

function CanvasSkeleton({ title }: { title?: string }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<Head title={title} action={112} />
			<div className="board relative flex min-h-[520px] flex-1 flex-col items-center gap-0 pt-12">
				{[0, 1, 2].map((i) => (
					<div key={i} className="flex flex-col items-center">
						{i > 0 ? <span className="h-10 w-px bg-ink/15" aria-hidden /> : null}
						<div className="hairline flex w-[280px] items-center gap-3 rounded-xl bg-paper p-3.5">
							<Bone className="size-8 rounded-lg" />
							<div className="flex flex-1 flex-col">
								<Line w={run(i, 0.7)} />
								<Line w={run(i + 4, 0.45)} className="opacity-70" />
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function CardsSkeleton({ title }: { title?: string }) {
	return (
		<>
			<Head title={title} />
			<div className="grid gap-4 px-5 pt-3 pb-6 sm:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: 6 }, (_, i) => (
					<div key={i} className="hairline flex flex-col gap-3 rounded-xl bg-paper p-4">
						<Bone className="h-[104px] w-full rounded-lg opacity-80" />
						<Line w={run(i, 0.6)} />
						<Line w={run(i + 4, 0.38)} className="opacity-70" />
					</div>
				))}
			</div>
		</>
	);
}

function ConversationSkeleton() {
	return (
		<div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col px-5 pt-[104px] pb-5">
			<Bone className="size-10 rounded-lg" />
			<Bone className="mt-5 h-[22px] w-[86%] rounded-full" />
			<Lines n={4} seed={3} className="mt-4 max-w-[430px]" />
			<div className="mt-5 flex flex-col gap-2">
				{Array.from({ length: 4 }, (_, i) => (
					<Bone key={i} className="h-10 w-full rounded-lg opacity-80" />
				))}
			</div>
			<span className="flex-1" />
			<Bone className="mt-10 h-[84px] w-full rounded-xl" />
		</div>
	);
}

function ListSkeleton({ title }: { title?: string }) {
	return (
		<>
			<Head title={title} action={null} />
			<div className="flex max-w-[960px] flex-col gap-6 px-5 pt-2 pb-6">
				{[4, 3].map((n, g) => (
					<div key={g} className="flex flex-col gap-1">
						<Bone className="mb-2 h-[9px] w-24 rounded-full" />
						{Array.from({ length: n }, (_, i) => (
							<div key={i} className={cn("flex items-center gap-3 rounded-md px-2 py-2", i % 2 === 0 && "bg-ink/[0.028]")}>
								<Disc size={28} />
								<div className="flex min-w-0 flex-1 flex-col">
									<Line w={run(g * 4 + i, 0.72)} />
									<Line w={run(g * 4 + i + 3, 0.48)} className="opacity-70" />
								</div>
								<Bone className="h-[8px] w-12 rounded-full" />
							</div>
						))}
					</div>
				))}
			</div>
		</>
	);
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

/** A sheet before its cells are computed: the grid is the sheet's own, the values are not. */
export function GridBones({ rows = 14 }: { rows?: number }) {
	return (
		<div aria-hidden className="overflow-hidden">
			<div className="grid grid-cols-[44px_repeat(8,minmax(96px,1fr))] text-ink-4 text-xs">
				<span className="h-7 bg-mist" />
				{LETTERS.map((l) => (
					<span key={l} className="flex h-7 items-center justify-center bg-mist">
						{l}
					</span>
				))}
				{Array.from({ length: rows }, (_, r) => (
					<div key={r} className="contents">
						<span className="flex h-8 items-center justify-center bg-mist tabular-nums">{r + 1}</span>
						{LETTERS.map((l, c) => (
							<span key={l} className="flex h-8 items-center px-2 shadow-[inset_-1px_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
								{(r * 3 + c * 5) % 4 !== 0 && r < rows - 3 ? (
									<Bone className={cn("h-[8px] rounded-full", c > 0 && "ml-auto")} style={{ width: `${c === 0 ? 70 : 34 + ((r + c) % 4) * 10}%` }} />
								) : null}
							</span>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

function GridSkeleton({ title }: { title?: string }) {
	return (
		<>
			<Head title={title} action={96} />
			<div className="flex flex-col gap-3 px-5 pb-6">
				<div className="flex items-center gap-2">
					{[32, 32, 32, 72, 88, 64].map((w, i) => (
						<Control key={i} w={w} h={28} />
					))}
				</div>
				<Bone className="h-9 w-full rounded-md" />
				<div className="hairline overflow-hidden rounded-lg bg-paper">
					<GridBones />
				</div>
			</div>
		</>
	);
}

function MapSkeleton() {
	return (
		<div className="flex flex-col gap-4 px-5 pt-5 pb-6">
			<div className="plate relative flex flex-col gap-5 overflow-hidden rounded-xl p-5">
				<span className="plate-scan" aria-hidden />
				<div className="grid grid-cols-2 gap-5 sm:grid-cols-5">
					{Array.from({ length: 5 }, (_, i) => (
						<div key={i} className={cn("flex flex-col gap-2", i >= 2 && "hidden sm:flex")}>
							<Bone plate className="h-[8px] w-16 rounded-full" />
							<Figure plate w={72} h={26} />
						</div>
					))}
				</div>
				<div className="hatch-on-plate h-[340px] rounded-lg" />
			</div>
			<div className="grid gap-4 lg:grid-cols-3">
				{[0, 1, 2].map((i) => (
					<Block key={i} className="hairline">
						<BlockHead w={96 + i * 12} />
						<Entries n={4} seed={i * 3} disc={i === 0} />
					</Block>
				))}
			</div>
		</div>
	);
}

const BODIES: Record<SkeletonKind, (p: { title?: string | undefined }) => React.ReactNode> = {
	table: TableSkeleton,
	board: BoardSkeleton,
	split: SplitSkeleton,
	channel: ChannelSkeleton,
	dashboard: DashboardSkeleton,
	overview: OverviewSkeleton,
	analytics: AnalyticsSkeleton,
	settings: SettingsSkeleton,
	document: DocumentSkeleton,
	canvas: CanvasSkeleton,
	cards: CardsSkeleton,
	conversation: ConversationSkeleton,
	list: ListSkeleton,
	grid: GridSkeleton,
	map: MapSkeleton,
};

/** A widget's body while it streams in: the rows it is about to have. */
export function WidgetBones({ plate = false, rows = 4 }: { plate?: boolean; rows?: number }) {
	return (
		<Arriving label="Kaart laden" className="flex flex-col gap-3 pt-1">
			{Array.from({ length: rows }, (_, i) => (
				<div key={i} className="flex items-center gap-3">
					<Bone plate={plate} className="size-6 rounded-full" />
					<div className="flex min-w-0 flex-1 flex-col">
						<Line plate={plate} w={run(i, 0.9)} />
						<Line plate={plate} w={run(i + 5, 0.55)} className="opacity-70" />
					</div>
					<Bone plate={plate} className="h-[8px] w-10 rounded-full" />
				</div>
			))}
		</Arriving>
	);
}
