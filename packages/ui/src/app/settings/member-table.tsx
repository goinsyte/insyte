import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { Check, MoreHorizontal } from "../../icons";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { EmptyState } from "../common/empty-state";
import { StatusPill } from "./setting-card";
import { DataTable, type Facet, facetFilter } from "../table/data-table";
import { PersonDisc } from "../team/bits";
import { storeAccessLabel } from "../team/role-text";
import { type TeamPerson, useSourceInviteRoles, useTeamSource } from "../team/source";
import { formatRelative } from "../lib/format";
import { undoable } from "../lib/undo";

/**
 * Who is in this workspace — one table, read from the workspace, used by every screen that lists
 * people. Invitations that have not been answered are not people yet and have their own list on the
 * team page; this is the people who got in. A row opens the person; the menu does the quick things.
 */

type Row = Omit<TeamPerson, "stores"> & { stores: string; by: string; seen?: string; me: boolean };

const STATUS_FACET: Facet = {
	id: "state",
	label: "Status",
	options: [
		{ value: "Actief", label: "Actief" },
		{ value: "Gedeactiveerd", label: "Gedeactiveerd" },
	],
};

export function MemberTable({ onOpen, onInvite }: { onOpen: (id: string) => void; onInvite: () => void }) {
	const { people: members, stores, me } = useTeamSource();

	const rows = useMemo<Row[]>(
		() =>
			members.map((m) => ({
				...m,
				stores: m.role === "Eigenaar" ? "Alle winkels" : storeAccessLabel(stores, m.stores),
				by: members.find((x) => x.id === m.invitedBy)?.name ?? "",
				seen: m.lastSeen === undefined ? undefined : new Date(m.lastSeen).toISOString(),
				me: m.id === me,
			})),
		[members, stores, me],
	);

	const columns = useMemo<Array<ColumnDef<Row, unknown>>>(
		() => [
			{
				id: "member",
				accessorFn: (m) => `${m.name} ${m.email}`,
				header: "Teamlid",
				size: 260,
				enableHiding: false,
				cell: (c) => {
					const m = c.row.original;
					return (
						<span className="flex min-w-0 items-center gap-2.5">
							<PersonDisc seed={m.id} name={m.name} />
							<span className="flex min-w-0 flex-col">
								<span className="truncate font-medium text-ink">
									{m.name}
									{m.me ? <span className="font-normal text-ink-3"> · jij</span> : null}
								</span>
								<span className="truncate text-ink-3 text-xs">{m.email}</span>
							</span>
						</span>
					);
				},
			},
			{
				id: "role",
				accessorKey: "role",
				header: "Rol",
				size: 150,
				filterFn: facetFilter,
				cell: (c) => <span className="text-ink">{c.row.original.role}</span>,
			},
			{
				id: "stores",
				accessorKey: "stores",
				header: "Winkels",
				size: 180,
				cell: (c) => <span className="block truncate">{c.row.original.stores}</span>,
			},
			{
				id: "active",
				accessorFn: (m) => m.seen ?? "",
				header: "Laatst actief",
				size: 130,
				cell: (c) => <span className="text-ink-2">{c.row.original.seen ? formatRelative(c.row.original.seen) : "Nog niet"}</span>,
			},
			{
				id: "by",
				accessorKey: "by",
				header: "Uitgenodigd door",
				size: 150,
				cell: (c) => <span className="block truncate text-ink-2">{c.row.original.by || "—"}</span>,
			},
			{
				id: "state",
				accessorFn: (m) => (m.deactivated ? "Gedeactiveerd" : "Actief"),
				header: "Status",
				size: 120,
				filterFn: facetFilter,
				cell: (c) => <StatusPill tone={c.row.original.deactivated ? "neutral" : "success"} label={c.row.original.deactivated ? "Gedeactiveerd" : "Actief"} />,
			},
			{
				id: "actions",
				header: "",
				size: 44,
				enableSorting: false,
				enableHiding: false,
				cell: (c) => <MemberActions member={c.row.original} onOpen={onOpen} />,
			},
		],
		[onOpen],
	);

	const facets = useMemo<ReadonlyArray<Facet>>(() => {
		const roles = [...new Set(rows.map((m) => m.role))];
		return [STATUS_FACET, { id: "role", label: "Rol", options: roles.map((r) => ({ value: r, label: r })) }];
	}, [rows]);

	return (
		<DataTable
			columns={columns}
			data={rows}
			facets={facets}
			getRowId={(m) => m.id}
			onRowClick={(m) => onOpen(m.id)}
			searchPlaceholder="Personen zoeken"
			pageSize={20}
			initialVisibility={{ by: false }}
			empty={
				<EmptyState
					kind="people"
					title={rows.length <= 1 ? "Je werkt hier nog alleen." : "Niemand past bij deze filters."}
					body={rows.length <= 1 ? "Nodig je team uit." : "Pas de filters aan of wis ze."}
					action={rows.length <= 1 ? { label: "Collega uitnodigen", onClick: onInvite } : undefined}
				/>
			}
		/>
	);
}

function MemberActions({ member, onOpen }: { member: Row; onOpen: (id: string) => void }) {
	const roles = useSourceInviteRoles();
	const source = useTeamSource();
	const owner = member.role === "Eigenaar";
	const me = member.me;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a click guard, not a control
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard reaches the button itself
		<span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label={`Acties voor ${member.name}`}
						className="flex size-7 items-center justify-center rounded-md text-ink-3 opacity-60 transition hover:bg-ink/6 hover:text-ink group-hover/row:opacity-100 data-[popup-open]:bg-ink/6 data-[popup-open]:opacity-100"
					>
						<MoreHorizontal className="size-4" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onClick={() => onOpen(member.id)}>Openen</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Rol</DropdownMenuLabel>
					{roles.map((role) => (
						<DropdownMenuItem
							key={role.id}
							disabled={owner}
							onClick={() => {
								if (role.label === member.role) return;
								const before = roles.find((r) => r.label === member.role)?.id;
								void source.setMemberRole(member.id, role.id).then((ok) => {
									if (ok && before) undoable(`${member.name} is nu ${role.label}`, () => void source.setMemberRole(member.id, before));
								});
							}}
						>
							<span className="flex-1">{role.label}</span>
							{role.label === member.role ? <Check className="size-3.5 text-arc-ink" strokeWidth={2.25} /> : null}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						disabled={owner || me}
						onClick={() => {
							void source.setDeactivated(member.id, !member.deactivated).then((ok) => {
								if (ok)
									undoable(member.deactivated ? `${member.name} kan weer inloggen` : `${member.name} gedeactiveerd`, () =>
										void source.setDeactivated(member.id, member.deactivated),
									);
							});
						}}
					>
						{member.deactivated ? "Weer activeren" : "Deactiveren"}
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						disabled={owner || me}
						onClick={() => {
							void source.remove(member.id).then((ok) => {
								if (ok) undoable(`${member.name} verwijderd`, () => void source.restoreMember(member.id));
							});
						}}
					>
						Verwijderen uit werkruimte
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</span>
	);
}
