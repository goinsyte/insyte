import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../components/table";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type RowData,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { cn } from "../lib/utils";

type Props<T extends RowData> = {
	columns: ColumnDef<T, unknown>[];
	data: T[];
	onRowClick?: (row: T) => void;
	pageSize?: number;
	emptyText?: string;
	className?: string;
};

export function DataTable<T extends RowData>({
	columns,
	data,
	onRowClick,
	pageSize = 25,
	emptyText = "Geen data.",
	className,
}: Props<T>) {
	const [sorting, setSorting] = useState<SortingState>([]);

	const table = useReactTable({
		data,
		columns,
		state: { sorting },
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		initialState: { pagination: { pageSize } },
	});

	return (
		<div className={cn("rounded-lg border border-border bg-card", className)}>
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((group) => (
						<TableRow key={group.id} className="bg-muted/40">
							{group.headers.map((header) => (
								<TableHead
									key={header.id}
									className="font-medium text-sm text-muted-foreground"
								>
									{header.isPlaceholder
										? null
										: flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={columns.length}
								className="text-center text-muted-foreground"
							>
								{emptyText}
							</TableCell>
						</TableRow>
					) : (
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								onClick={
									onRowClick ? () => onRowClick(row.original) : undefined
								}
								className={cn(onRowClick && "cursor-pointer hover:bg-muted/40")}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
			{table.getPageCount() > 1 ? (
				<div className="flex items-center justify-between border-border border-t px-3 py-2 text-muted-foreground font-medium text-xs">
					<span>
						{" "}
						{table.getState().pagination.pageIndex *
							table.getState().pagination.pageSize +
							1}
						–
						{Math.min(
							(table.getState().pagination.pageIndex + 1) *
								table.getState().pagination.pageSize,
							data.length,
						)}{" "}
						van {data.length}
					</span>
					<div className="flex items-center gap-1">
						<button
							type="button"
							className="rounded-md border border-border bg-card px-2 py-1 disabled:opacity-50"
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							Vorige
						</button>
						<span>
							{table.getState().pagination.pageIndex + 1} /{" "}
							{table.getPageCount()}
						</span>
						<button
							type="button"
							className="rounded-md border border-border bg-card px-2 py-1 disabled:opacity-50"
							onClick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
						>
							Volgende
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
