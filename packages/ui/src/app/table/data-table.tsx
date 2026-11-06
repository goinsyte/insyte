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
import { useEffect, useMemo, useState } from "react";
import { FilterButton, FilterChips, ViewTabs } from "../filters/filter-bar";
import { useListFilter } from "../filters/use-list-filter";
import { applyFilter, countRules, type FilterField } from "../lib/filter";
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
 */

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
	pageSize = 12,
	initialSorting = [],
	initialVisibility = {},
	selectable = false,
	getRowId,
	onSelectedChange,
	actions,
	noun = ["row", "rows"],
	label,
	className,
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
}) {
	const [sorting, setSorting] = useState<SortingState>(initialSorting);
	const viewKey = noun[1];
	const shown = label ?? NOUN_LABEL[noun[1]] ?? noun;
	const { filter, setFilter, saveView } = useListFilter(viewKey);
	const fields = useMemo(() => fieldsFrom(columns, facets, data), [columns, facets, data]);
	/* The filter runs before the table sees the rows, so sorting, search and pages work on what is
	   left — and an option's count in the builder is over the whole list, not the current cut. */
	const filtered = useMemo(() => applyFilter(data, filter, fields), [data, filter, fields]);
	const [columnVisibility, setColumnVisibility] =
		useState<VisibilityState>(initialVisibility);
	const [globalFilter, setGlobalFilter] = useState("");
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	/* The checkbox column is prepended here rather than written into every screen's column list:
	   it is the table's furniture, not the screen's data, and it has to look the same everywhere. */
	const picking = selectable || (actions !== undefined && actions.length > 0);
	const allColumns = useMemo(
		() => (picking ? [selectColumn<T>(), ...columns] : columns),
		[picking, columns],
	);

	const table = useReactTable({
		data: filtered,
		columns: allColumns,
		getRowId: getRowId
			? (row, index) => getRowId(row) || String(index)
			: undefined,
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
			if (onSelectedChange !== undefined) {
				const chosen = filtered.filter((row, i) => {
					const id = getRowId ? getRowId(row) : String(i);
					return next[id] === true;
				});
				onSelectedChange(chosen);
			}
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
		/* TanStack's own reset writes a fresh pagination object whenever the rows change, even on
		   page one, so a caller passing a new array each render loops the page forever. The effect
		   below does the same reset, and only when there is a page to go back from. */
		autoResetPageIndex: false,
	});
	const onPage = table.getState().pagination.pageIndex;
	useEffect(() => {
		if (onPage !== 0) table.setPageIndex(0);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- reset on new rows, not on paging
	}, [filtered, globalFilter, sorting]);

	const activeFilters = countRules(filter);
	const picked = table.getSelectedRowModel().rows.map((r) => r.original);
	const rows = table.getRowModel().rows;
	const total = table.getFilteredRowModel().rows.length;
	const { pageIndex } = table.getState().pagination;
	const first = total === 0 ? 0 : pageIndex * pageSize + 1;
	const last = Math.min(total, (pageIndex + 1) * pageSize);

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

				<FilterButton fields={fields} rows={data} value={filter} onChange={setFilter} onSaveView={saveView} />

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

			<FilterChips fields={fields} rows={data} value={filter} onChange={setFilter} />

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
											{data.length === 0 ? `Nog geen ${shown[1]}.` : `Geen ${shown[1]} voor deze zoekopdracht of filters.`}
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
							disabled={!table.getCanPreviousPage()}
							onClick={() => table.previousPage()}
						>
							<ChevronLeft className="size-3.5" strokeWidth={2} />
						</PageButton>
						<p className="px-1 font-medium text-xs text-ink-2 tabular-nums">
							{pageIndex + 1} / {table.getPageCount()}
						</p>
						<PageButton
							label="Volgende pagina"
							disabled={!table.getCanNextPage()}
							onClick={() => table.nextPage()}
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
