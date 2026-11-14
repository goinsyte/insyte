import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { Checkbox } from "../../components/checkbox";
import {
	type Column,
	type ColumnDef,
	type RowSelectionState,
	type SortingState,
	type VisibilityState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	ArrowDown,
	ArrowUp,
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	Columns3,
	Search,
	X,
} from "../../icons";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterButton, FilterChips, type OptionCounts, OptionCountsProvider, ViewTabs } from "../filters/filter-bar";
import { useListFilter } from "../filters/use-list-filter";
import { applyFilter, countRules, type FilterField, type Group } from "../lib/filter";
import type { TableQuery } from "../lib/server-query";
import { cn } from "../lib/utils";
import { type RowAction, SelectionBar } from "./selection-bar";

export type { RowAction };

/**
 * One table, for every list in the console.
 *
 * Six screens each hand-rolled their own: a flex row of `HeaderCell`s over a `.map()`, with sorting
 * nowhere, column choice as a dropdown of `toast("mock")`, and the cuts of the data sitting above
 * the table as a row of tab chips. Six copies is six densities, six empty states and six ideas of
 * what a column is — and the one that mattered, the operator's ability to say "show me the delayed
 * ones from this supplier", was not in any of them because each copy would have had to build it.
 *
 * So: `@tanstack/react-table` holds the state that is genuinely table state — sort, filters,
 * visibility, pagination — and this component is the one place the console decides what a table
 * LOOKS like. A screen supplies columns and rows.
 *
 * Density is the point. Head 32px, row 36px, 12px gutters, 13px type — the numbers a tool people
 * live in runs at, and roughly half the 67px rows this replaced. The lines between rows stay: a row
 * boundary is a data boundary, which is the one thing this system lets a hairline do.
 *
 * The cuts that used to be tabs are filters, built the way ClickUp builds them (`filters/filter-bar.tsx`):
 * rules joined by And or Or, groups inside them, a chip per rule under the toolbar, and a filter worth
 * keeping saved as a view tab. The fields come from the columns themselves — a number column can be
 * "above", a date "in the last 7 days", a column with a handful of values is an option list — so a
 * screen gets the whole builder by declaring its columns, and names its facets only to fix the order
 * and labels of an option list.
 *
 * A list too long to hold in the browser pages on the server (`server`): the table keeps the same
 * toolbar, chips, views, sort arrows, footer and selection, and hands what they say to the host as a
 * query; the host reads that page and gives its rows back as `data`. Only the columns the host can
 * filter or sort by on the server offer it. A selection spans pages; a new filter or search clears it,
 * as a cut no longer shows what was picked.
 */

export type { TableQuery };

/** How many rows a page of a table holds, unless the screen says otherwise. */
export const PAGE_ROWS = 12;

/** The host's side of a table that pages on the server. */
export type ServerPaging = {
	/** The rows matching the query, over every page. */
	total: number;
	/** The rows in the list with no filter or search: none at all is the screen's empty state, not the table's. */
	all: number;
	/** The cursor after the page in `data`; null on the last page. */
	next: string | null;
	/** A page is being read; the table keeps showing the one it has meanwhile. */
	fetching: boolean;
	/** The columns the server filters and sorts by; the others offer neither. */
	filterable: ReadonlySet<string>;
	sortable: ReadonlySet<string>;
	/** An option field's counts over every page, where the server counts it; otherwise the builder shows none. */
	counts?: OptionCounts | undefined;
	/** Every new query, the first included; the host reads its page. */
	onQuery: (query: TableQuery) => void;
};

/** How long a changed filter or search rests before the server is asked. */
const SEARCH_PAUSE = 250;
const NO_COUNTS: OptionCounts = () => undefined;

/** A filter's shape: its rules and groups by id, not what they hold. */
const nodeIds = (g: Group): string =>
	g.children.map((c) => (c.kind === "group" ? `${c.id}(${nodeIds(c)})` : c.id)).join(",");

export type Facet = {
	/** The column id the facet filters. */
	id: string;
	/** What it is called in the menu and on the chip: "Status", "Supplier". */
	label: string;
	/** Fixed options, in the order they should read. Counts come from the data. */
	options: ReadonlyArray<{ value: string; label: string }>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Every column a person could filter by, typed from what it holds. A facet's column is an option
 * list in the facet's order; otherwise numbers are numbers, ISO strings are dates, and a text column
 * with only a few distinct values across many rows is treated as options too.
 */
function fieldsFrom<T>(columns: ReadonlyArray<ColumnDef<T, unknown>>, facets: ReadonlyArray<Facet>, data: ReadonlyArray<T>): FilterField<T>[] {
	const out: FilterField<T>[] = [];
	for (const c of columns) {
		const def = c as ColumnDef<T, unknown> & { accessorKey?: string; accessorFn?: (row: T, i: number) => unknown };
		const id = def.id ?? def.accessorKey;
		if (id === undefined || id === "select") continue;
		const get =
			def.accessorFn !== undefined
				? (row: T) => def.accessorFn?.(row, 0)
				: def.accessorKey !== undefined
					? (row: T) => (row as Record<string, unknown>)[def.accessorKey as string]
					: undefined;
		if (get === undefined) continue;
		const label = typeof def.header === "string" ? def.header : id;
		const facet = facets.find((f) => f.id === id);
		if (facet !== undefined) {
			out.push({ id, label: facet.label, type: "option", options: facet.options, get });
			continue;
		}
		const sample = data.map(get).find((v) => v !== undefined && v !== null && v !== "");
		if (typeof sample === "number") out.push({ id, label, type: "number", get });
		else if (typeof sample === "string" && ISO_DATE.test(sample)) out.push({ id, label, type: "date", get });
		else if (typeof sample === "string") {
			const distinct = new Set(data.map((r) => String(get(r))));
			out.push(
				distinct.size <= 12 && data.length > distinct.size * 2
					? { id, label, type: "option", get }
					: { id, label, type: "text", get },
			);
		}
	}
	return out;
}

/** Display nouns for the list keys callers pass as `noun`, so every table speaks Dutch. */
/* One empty list for every table without facets. A fresh `[]` per render would remake `fields` and
   `filtered` each time, and the table answers new rows by resetting its page — a render loop. */
const NO_FACETS: ReadonlyArray<Facet> = [];

const NOUN_LABEL: Record<string, readonly [string, string]> = {
	rows: ["rij", "rijen"],
	orders: ["bestelling", "bestellingen"],
	customers: ["klant", "klanten"],
	products: ["product", "producten"],
	tickets: ["ticket", "tickets"],
	runs: ["uitvoering", "uitvoeringen"],
	flows: ["automatisering", "automatiseringen"],
	automations: ["automatisering", "automatiseringen"],
	chargebacks: ["zaak", "zaken"],
	cases: ["zaak", "zaken"],
	suppliers: ["leverancier", "leveranciers"],
	"imported rows": ["geïmporteerde rij", "geïmporteerde rijen"],
	"sheet rows": ["rij", "rijen"],
};

export function DataTable<T>({
	columns,
	data,
	loading = false,
	facets = NO_FACETS,
	searchPlaceholder = "Zoeken",
	onRowClick,
	empty,
	toolbarEnd,
	pageSize = PAGE_ROWS,
	initialSorting = [],
	initialVisibility = {},
	selectable = false,
	getRowId,
	onSelectedChange,
	actions,
	noun = ["row", "rows"],
	label,
	className,
	server,
}: {
	columns: Array<ColumnDef<T, unknown>>;
	data: Array<T>;
	loading?: boolean;
	facets?: ReadonlyArray<Facet>;
	searchPlaceholder?: string;
	onRowClick?: (row: T) => void;
	empty?: ReactNode;
	/** Screen-specific toolbar controls, at the right end. */
	toolbarEnd?: ReactNode;
	pageSize?: number;
	initialSorting?: SortingState;
	initialVisibility?: VisibilityState;
	/** Adds the leading checkbox column. The screen decides what selection is FOR. */
	selectable?: boolean;
	getRowId?: (row: T) => string;
	onSelectedChange?: (rows: Array<T>) => void;
	/** What can be done to picked rows: the floating bar, the ⌘K menu and single-key shortcuts. */
	actions?: ReadonlyArray<RowAction<T>>;
	/** What a row is called, singular and plural, for "3 orders selected". */
	noun?: readonly [string, string];
	/** Dutch singular/plural for display; `noun` stays the view key. Falls back to NOUN_LABEL. */
	label?: readonly [string, string];
	className?: string;
	/** Pages on the server: `data` is the page the host read for the table's last query. */
	server?: ServerPaging | undefined;
}) {
	const [sorting, setSorting] = useState<SortingState>(initialSorting);
	const viewKey = noun[1];
	const shown = label ?? NOUN_LABEL[noun[1]] ?? noun;
	const { filter, setFilter, saveView } = useListFilter(viewKey);
	/* On the server a page is a dozen rows: the fields are typed from the first page that had any, so a
	   field does not change kind between pages or vanish when a filter matches nothing. */
	const typedFrom = useRef<Array<T> | null>(null);
	if (server !== undefined && typedFrom.current === null && data.length > 0) typedFrom.current = data;
	const paged = server !== undefined;
	const sample = paged ? (typedFrom.current ?? data) : data;
	const filterable = server?.filterable;
	const fields = useMemo(() => {
		const all = fieldsFrom(columns, facets, sample);
		return filterable === undefined ? all : all.filter((f) => filterable.has(f.id));
	}, [columns, facets, sample, filterable]);
	/* The filter runs before the table sees the rows, so sorting, search and pages work on what is
	   left — and an option's count in the builder is over the whole list, not the current cut. On the
	   server, the server filtered already. */
	const filtered = useMemo(
		() => (paged ? data : applyFilter(data, filter, fields)),
		[paged, data, filter, fields],
	);
	const [columnVisibility, setColumnVisibility] =
		useState<VisibilityState>(initialVisibility);
	const [globalFilter, setGlobalFilter] = useState("");
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	/* The filter and search as the server is asked them. Typing — a search, or a rule's value — asks
	   once it rests, not per keystroke; a cut, a view or a rule added or taken away asks at once. */
	const filterKey = JSON.stringify(filter);
	const [settled, setSettled] = useState({ filter, filterKey, q: "" });
	useEffect(() => {
		if (!paged) return;
		const text = globalFilter.trim();
		if (filterKey === settled.filterKey && text === settled.q) return;
		const typing = text !== settled.q || nodeIds(filter) === nodeIds(settled.filter);
		const t = setTimeout(() => setSettled({ filter, filterKey, q: text }), typing ? SEARCH_PAUSE : 0);
		return () => clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the filter is read through its key
	}, [paged, filterKey, globalFilter, settled]);
	const q = settled.q;

	/* The server's pages: the page shown, and the cursor each page read starts after (`null` for the
	   first). A new filter, search or order starts at the first page again. */
	const [page, setPage] = useState(0);
	const [cursors, setCursors] = useState<ReadonlyArray<string | null>>([null]);
	const sort = sorting[0];
	const sortKey = sort === undefined ? "" : `${sort.id}:${sort.desc ? "desc" : "asc"}`;
	const queryKey = `${settled.filterKey}|${q}|${sortKey}`;
	const [askedFor, setAskedFor] = useState(queryKey);
	if (paged && askedFor !== queryKey) {
		setAskedFor(queryKey);
		setPage(0);
		setCursors([null]);
	}
	const cursor = askedFor === queryKey ? (cursors[page] ?? null) : null;
	const onQuery = server?.onQuery;
	useEffect(() => {
		onQuery?.({
			filter: settled.filter,
			q,
			sort: sort === undefined ? null : { id: sort.id, desc: sort.desc },
			cursor: askedFor === queryKey ? (cursors[page] ?? null) : null,
			limit: pageSize,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps -- asked again when what it says changes
	}, [onQuery, queryKey, cursor, pageSize]);

	/* A selection on the server spans pages: the rows picked are remembered as they were last seen,
	   and a new filter or search lets them go. */
	const seen = useRef(new Map<string, T>());
	if (server !== undefined && getRowId !== undefined) {
		for (const row of data) seen.current.set(getRowId(row), row);
	}
	const cutKey = `${settled.filterKey}|${q}`;
	const cutFor = useRef(cutKey);
	useEffect(() => {
		if (!paged || cutFor.current === cutKey) return;
		cutFor.current = cutKey;
		setRowSelection({});
		seen.current = new Map();
		onSelectedChange?.([]);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- let go on a new cut, not on a new callback
	}, [paged, cutKey]);
	const pickedOf = (selection: RowSelectionState): Array<T> =>
		server !== undefined && getRowId !== undefined
			? Object.keys(selection)
					.filter((id) => selection[id] === true)
					.flatMap((id) => {
						const row = seen.current.get(id);
						return row === undefined ? [] : [row];
					})
			: filtered.filter((row, i) => selection[getRowId ? getRowId(row) : String(i)] === true);

	/* The checkbox column is prepended here rather than written into every screen's column list:
	   it is the table's furniture, not the screen's data, and it has to look the same everywhere. On
	   the server, a column it cannot sort by does not offer to. */
	const picking = selectable || (actions !== undefined && actions.length > 0);
	const sortable = server?.sortable;
	const allColumns = useMemo(() => {
		const own = sortable === undefined
			? columns
			: columns.map((c) => {
					const id = c.id ?? (c as { accessorKey?: string }).accessorKey;
					return id !== undefined && sortable.has(id) ? c : { ...c, enableSorting: false };
				});
		return picking ? [selectColumn<T>(), ...own] : own;
	}, [picking, columns, sortable]);

	const pages = server === undefined ? undefined : Math.max(1, Math.ceil(server.total / pageSize));
	const table = useReactTable({
		data: filtered,
		columns: allColumns,
		...(getRowId ? { getRowId: (row: T, index: number) => getRowId(row) || String(index) } : {}),
		enableRowSelection: picking,
		state: {
			sorting,
			columnVisibility,
			globalFilter,
			rowSelection,
		},
		onRowSelectionChange: (updater) => {
			const next =
				typeof updater === "function" ? updater(rowSelection) : updater;
			setRowSelection(next);
			if (onSelectedChange !== undefined) onSelectedChange(pickedOf(next));
		},
		onSortingChange: setSorting,
		onColumnVisibilityChange: setColumnVisibility,
		onGlobalFilterChange: setGlobalFilter,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		globalFilterFn: "includesString",
		initialState: { pagination: { pageSize } },
		...(pages === undefined
			? {}
			: {
					manualFiltering: true,
					manualSorting: true,
					manualPagination: true,
					enableMultiSort: false,
					pageCount: pages,
				}),
		/* TanStack's own reset writes a fresh pagination object whenever the rows change, even on
		   page one, so a caller passing a new array each render loops the page forever. The effect
		   below does the same reset, and only when there is a page to go back from. */
		autoResetPageIndex: false,
	});
	const onPage = table.getState().pagination.pageIndex;
	useEffect(() => {
		if (server === undefined && onPage !== 0) table.setPageIndex(0);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- reset on new rows, not on paging
	}, [filtered, globalFilter, sorting]);

	const activeFilters = countRules(filter);
	const picked = server === undefined ? table.getSelectedRowModel().rows.map((r) => r.original) : pickedOf(rowSelection);
	const rows = table.getRowModel().rows;
	const total = server === undefined ? table.getFilteredRowModel().rows.length : server.total;
	const pageIndex = server === undefined ? table.getState().pagination.pageIndex : page;
	const first = total === 0 ? 0 : pageIndex * pageSize + 1;
	const last = server === undefined
		? Math.min(total, (pageIndex + 1) * pageSize)
		: Math.min(total, pageIndex * pageSize + rows.length);
	const pageCount = pages ?? table.getPageCount();
	const canPrevious = server === undefined ? table.getCanPreviousPage() : page > 0;
	const canNext = server === undefined ? table.getCanNextPage() : server.next !== null && !server.fetching;
	const previous = () => {
		if (server === undefined) table.previousPage();
		else setPage((p) => Math.max(0, p - 1));
	};
	const nextPage = () => {
		if (server === undefined) return table.nextPage();
		const after = server.next;
		if (after === null) return;
		setCursors((c) => [...c.slice(0, page + 1), after]);
		setPage(page + 1);
	};
	/* With a filter on the server, an empty page is an empty cut, not an empty list. */
	const nothingYet = server === undefined ? data.length === 0 : countRules(settled.filter) === 0 && q === "";

	return (
		<div className={cn("flex min-w-0 flex-col gap-2.5", className)}>
			<ViewTabs viewKey={viewKey} allLabel={`Alle ${shown[1]}`} value={filter} onPick={setFilter} />
			{/*
			 * One toolbar row. Search on the left where the eye starts, facets beside it, screen
			 * actions at the far end — and the active filters as chips on a second row only when
			 * there ARE any, so an unfiltered table costs one row and not two.
			 */}
			<div className="flex flex-wrap items-center gap-1.5">
				<div className="relative">
					<Search
						className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
						strokeWidth={1.75}
					/>
					<input
						type="search"
						value={globalFilter}
						onChange={(e) => setGlobalFilter(e.target.value)}
						placeholder={searchPlaceholder}
						className="field field-hover h-8 w-52 rounded-md pr-2.5 pl-8 text-sm text-ink outline-none placeholder:text-ink-3 focus:bg-paper"
					/>
				</div>

				<OptionCountsProvider value={server === undefined ? null : (server.counts ?? NO_COUNTS)}>
					<FilterButton fields={fields} rows={data} value={filter} onChange={setFilter} onSaveView={saveView} />
				</OptionCountsProvider>

				{activeFilters > 0 || globalFilter !== "" ? (
					<button
						type="button"
						onClick={() => {
							setFilter({ ...filter, children: [] });
							setGlobalFilter("");
						}}
						className="flex h-8 items-center gap-1.5 rounded-md px-2 font-medium text-xs text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						<X className="size-3.5" strokeWidth={2} />
						Wissen
					</button>
				) : null}

				<div className="ml-auto flex items-center gap-1.5">
					{toolbarEnd}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
							>
								<Columns3 className="size-3.5" strokeWidth={1.75} />
								Kolommen
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuLabel>Kolommen</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{table
								.getAllLeafColumns()
								.filter((c) => c.getCanHide())
								.map((c) => (
									<DropdownMenuCheckboxItem
										key={c.id}
										checked={c.getIsVisible()}
										onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
									>
										{headerLabel(c)}
									</DropdownMenuCheckboxItem>
								))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<OptionCountsProvider value={server === undefined ? null : (server.counts ?? NO_COUNTS)}>
				<FilterChips fields={fields} rows={data} value={filter} onChange={setFilter} />
			</OptionCountsProvider>

			{/*
			 * The home queue's grammar, so every list reads like the screen the operator opens first:
			 * no frame around the table and no rule between rows. The head is a line of quiet labels,
			 * and the rows are banded `paper` / `mist` with soft ends, which is what lets the eye track
			 * across ten columns without a single line being drawn.
			 */}
			<div className="table-scroll">
				<table className="w-full border-separate border-spacing-0 text-left">
					<thead>
						{table.getHeaderGroups().map((group) => (
							<tr key={group.id}>
								{group.headers.map((header) => {
									const sortable = header.column.getCanSort();
									const dir = header.column.getIsSorted();
									return (
										<th
											key={header.id}
											scope="col"
											style={{ width: header.column.columnDef.size }}
											className="h-8 whitespace-nowrap px-3 font-medium text-xs text-ink-3"
										>
											{header.isPlaceholder ? null : sortable ? (
												<button
													type="button"
													onClick={header.column.getToggleSortingHandler()}
													className="group/head -mx-1 flex h-6 items-center gap-1 rounded-sm px-1 transition-colors hover:text-ink"
												>
													{flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
													{dir === "asc" ? (
														<ArrowUp className="size-3" strokeWidth={2} />
													) : dir === "desc" ? (
														<ArrowDown className="size-3" strokeWidth={2} />
													) : (
														<ChevronsUpDown
															className="size-3 opacity-0 transition-opacity group-hover/head:opacity-60"
															strokeWidth={2}
														/>
													)}
												</button>
											) : (
												flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)
											)}
										</th>
									);
								})}
							</tr>
						))}
					</thead>
					<tbody>
						{loading ? (
							<LoadingRows
								rows={6}
								cols={table.getVisibleLeafColumns().length}
							/>
						) : rows.length === 0 ? (
							<tr>
								<td colSpan={table.getVisibleLeafColumns().length}>
									{/* A table with nothing to show says so, rather than ending at its header. */}
									{empty ?? (
										<p className="py-12 text-center text-ink-3 text-sm">
											{nothingYet ? `Nog geen ${shown[1]}.` : `Geen ${shown[1]} voor deze zoekopdracht of filters.`}
										</p>
									)}
								</td>
							</tr>
						) : (
							rows.map((row, i) => (
								<tr
									key={row.id}
									onClick={
										onRowClick
											? () => onRowClick(row.original)
											: undefined
									}
									data-selected={row.getIsSelected() ? "" : undefined}
									className={cn(
										"group/row transition-colors duration-[80ms] data-selected:bg-arc-tint",
										i % 2 === 0 ? "bg-mist" : "bg-paper",
										onRowClick ? "cursor-pointer hover:bg-ink/6" : "hover:bg-ink/4",
									)}
								>
									{row.getVisibleCells().map((cell) => (
										<td
											key={cell.id}
											className="density-cell h-9 whitespace-nowrap px-3 text-sm text-ink-2 first:rounded-l-md last:rounded-r-md"
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</td>
									))}
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{/*
			 * The footer only exists when there is more than one page of anything. A row reading
			 * "1–7 of 7" under a table of seven is a line of furniture telling you what you can see.
			 */}
			{!loading && total > pageSize ? (
				<div className="flex items-center justify-between px-0.5">
					<p className="font-medium text-xs text-ink-3 tabular-nums">
						{first}–{last} van {total}
					</p>
					<div className="flex items-center gap-1">
						<PageButton
							label="Vorige pagina"
							disabled={!canPrevious}
							onClick={previous}
						>
							<ChevronLeft className="size-3.5" strokeWidth={2} />
						</PageButton>
						<p className="px-1 font-medium text-xs text-ink-2 tabular-nums">
							{pageIndex + 1} / {pageCount}
						</p>
						<PageButton
							label="Volgende pagina"
							disabled={!canNext}
							onClick={nextPage}
						>
							<ChevronRight className="size-3.5" strokeWidth={2} />
						</PageButton>
					</div>
				</div>
			) : null}

			{actions !== undefined && actions.length > 0 ? (
				<SelectionBar
					rows={picked}
					actions={actions}
					noun={shown}
					onClear={() => table.resetRowSelection()}
				/>
			) : null}
		</div>
	);
}

function PageButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className="flex size-7 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:text-ink-4"
		>
			{children}
		</button>
	);
}

/* Shapes, not spinners: the table that is coming has rows this tall and columns this wide. */
function LoadingRows({ rows, cols }: { rows: number; cols: number }) {
	return (
		<>
			{Array.from({ length: rows }, (_, r) => (
				<tr key={r} className={r % 2 === 0 ? "bg-mist" : "bg-paper"}>
					{Array.from({ length: cols }, (_, c) => (
						<td key={c} className="h-9 px-3">
							<span
								className="block h-3 rounded-sm bg-ink/8"
								style={{ width: `${55 + ((r * 7 + c * 13) % 35)}%` }}
							/>
						</td>
					))}
				</tr>
			))}
		</>
	);
}

/**
 * The checkbox column. Not sortable, not hideable, not a data column — it is the handle.
 *
 * `stopPropagation` on the cell is what keeps "select this row" from also meaning "open this row",
 * which is the bug every hand-rolled version of this table had.
 */
function selectColumn<T>(): ColumnDef<T, unknown> {
	return {
		id: "select",
		size: 36,
		enableSorting: false,
		enableHiding: false,
		header: ({ table }) => (
			<Checkbox
				checked={table.getIsAllPageRowsSelected()}
				indeterminate={table.getIsSomePageRowsSelected()}
				onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
				aria-label="Alle rijen op deze pagina selecteren"
			/>
		),
		cell: ({ row }) => (
			// biome-ignore lint/a11y/noStaticElementInteractions: a click guard, not a control
			// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard reaches the checkbox itself
			<span
				className="flex items-center"
				onClick={(e) => e.stopPropagation()}
			>
				<Checkbox
					checked={row.getIsSelected()}
					onCheckedChange={(v) => row.toggleSelected(Boolean(v))}
					aria-label="Rij selecteren"
				/>
			</span>
		),
	};
}

/** The label a column shows in the Columns menu: its header when that is a string, else its id. */
function headerLabel<T>(column: Column<T, unknown>): string {
	const h = column.columnDef.header;
	return typeof h === "string" ? h : column.id;
}

/** The filter a facet column needs: "is the row's value one of the chosen ones". */
export const facetFilter = (
	row: { getValue: (id: string) => unknown },
	id: string,
	value: unknown,
): boolean => {
	const chosen = value as Array<string> | undefined;
	if (chosen === undefined || chosen.length === 0) return true;
	return chosen.includes(String(row.getValue(id)));
};
