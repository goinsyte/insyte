import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "../../components/command";
import { useNavigate } from "@tanstack/react-router";
import { CornerDownLeft, ShoppingBag, Sparkles, Ticket, User } from "../../icons";
import type { Persona } from "../lib/types/persona";
import { useState } from "react";
import { CREATE_ITEMS, useStartCreate } from "./new-menu";
import { RotateCcw } from "../../icons";
import { useRecordSearch, useReturns, useShellData, useWorkspace } from "./state";

type CommandPaletteProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	persona: Persona;
	onAskInsyte: () => void;
};


export function CommandPalette({
	open,
	onOpenChange,
	persona,
	onAskInsyte,
}: CommandPaletteProps) {
	const navigate = useNavigate();
	const start = useStartCreate();
	const { navByPersona, customers } = useShellData();
	const nav = navByPersona[persona];
	const orders = useWorkspace((s) => s.orders);
	const tickets = useWorkspace((s) => s.tickets);
	const chargebacks = useWorkspace((s) => s.chargebacks);
	const made = useWorkspace((s) => s.createdCustomers);
	const returnRecords = useReturns((s) => s.records);
	const admin = persona === "admin";
	const [query, setQuery] = useState("");
	// The host's search where it has one (the console's server), else the workspace's own records, filtered as typed.
	const found = useRecordSearch(query);
	const orderHits = found?.orders ?? orders.map((o) => ({ id: o.id, number: o.number, customer: o.customer_name }));
	const customerHits = found?.customers ?? [...made, ...customers];

	function go(to: string, params?: Record<string, string>, search?: Record<string, string>) {
		onOpenChange(false);
		navigate({ to, params, search } as never);
	}

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Opdrachtenpalet"
			description="Zoek en navigeer in Insyte"
		>
			<CommandInput placeholder={admin ? "Zoek bestellingen, klanten, tickets of typ een opdracht" : "Ga naar een pagina"} value={query} onValueChange={setQuery} />
			<CommandList>
				<CommandEmpty>Geen resultaten gevonden.</CommandEmpty>
				<CommandGroup heading="Acties">
					{admin ? (
						<CommandItem
							onSelect={() => {
								onOpenChange(false);
								onAskInsyte();
							}}
						>
							<Sparkles className="size-4" />
							<span>Vraag Insyte</span>
							<CommandShortcut>
								<Kbd>⌘</Kbd>
								<Kbd>J</Kbd>
							</CommandShortcut>
						</CommandItem>
					) : null}
					{admin
						? CREATE_ITEMS.map((c) => (
								<CommandItem
									key={c.kind}
									value={c.newLabel}
									onSelect={() => {
										onOpenChange(false);
										start(c.kind);
									}}
								>
									<c.icon className="size-4" />
									<span>{c.newLabel}</span>
								</CommandItem>
							))
						: null}
				</CommandGroup>
				{/* Records, so the search the palette promises is a search: type a number or a name. */}
				{admin && query.trim().length > 0 ? (
					<>
						<CommandGroup heading="Bestellingen">
							{orderHits.map((o) => (
								<CommandItem key={o.id} value={`${o.number} ${o.customer}`} onSelect={() => go("/orders/$orderId", { orderId: o.id })}>
									<ShoppingBag className="size-4" />
									<span className="tabular-nums">{o.number}</span>
									<span className="truncate text-ink-3">{o.customer}</span>
								</CommandItem>
							))}
						</CommandGroup>
						<CommandGroup heading="Retouren">
							{returnRecords.map((r) => (
								<CommandItem key={r.id} value={`${r.number} ${r.orderNumber} ${r.customerName}`} onSelect={() => go("/returns/$returnId", { returnId: r.id })}>
									<RotateCcw className="size-4" />
									<span className="tabular-nums">{r.number}</span>
									<span className="truncate text-ink-3">{r.customerName} · {r.orderNumber}</span>
								</CommandItem>
							))}
						</CommandGroup>
						<CommandGroup heading="Klanten">
							{customerHits.map((c) => (
								<CommandItem key={c.id} value={`${c.name} ${c.email}`} onSelect={() => go("/customers/$customerId", { customerId: c.id })}>
									<User className="size-4" />
									<span>{c.name}</span>
									<span className="truncate text-ink-3">{c.email}</span>
								</CommandItem>
							))}
						</CommandGroup>
						<CommandGroup heading="Tickets">
							{tickets.map((t) => (
								<CommandItem key={t.id} value={`${t.number} ${t.title}`} onSelect={() => go("/tickets", undefined, { ticket: t.id })}>
									<Ticket className="size-4" />
									<span className="tabular-nums">{t.number}</span>
									<span className="truncate text-ink-3">{t.title}</span>
								</CommandItem>
							))}
						</CommandGroup>
						<CommandGroup heading="Chargebacks">
							{chargebacks.map((c) => (
								<CommandItem key={c.id} value={`${c.case_number} ${c.customer_name}`} onSelect={() => go("/chargebacks/$chargebackId", { chargebackId: c.id })}>
									<CornerDownLeft className="size-4" />
									<span className="tabular-nums">{c.case_number}</span>
									<span className="truncate text-ink-3">{c.customer_name}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</>
				) : null}
				{nav.sections.map((section) => (
					<CommandGroup
						key={section.label ?? "nav"}
						heading={section.label ?? "Navigatie"}
					>
						{section.items.map((item) => {
							const Icon = item.icon;
							return (
								<CommandItem key={item.to} onSelect={() => go(item.to)}>
									<Icon className="size-4" />
									<span>{item.label}</span>
								</CommandItem>
							);
						})}
					</CommandGroup>
				))}
			</CommandList>
			<footer className="flex items-center justify-between border-hairline border-t bg-mist/40 px-4 py-2.5 font-medium text-xs text-ink-3 leading-none">
				<div className="flex items-center gap-4">
					<span className="inline-flex items-center gap-1.5">
						<Kbd>
							<CornerDownLeft className="size-2.5" strokeWidth={2.25} />
						</Kbd>
						<span>selecteren</span>
					</span>
					<span className="inline-flex items-center gap-1.5">
						<Kbd>↑</Kbd>
						<Kbd>↓</Kbd>
						<span>navigeren</span>
					</span>
				</div>
				<span className="inline-flex items-center gap-1.5">
					<Kbd>esc</Kbd>
					<span>sluiten</span>
				</span>
			</footer>
		</CommandDialog>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-paper px-1 tabular-nums font-medium text-2xs text-ink-2 leading-none tracking-[0]">
			{children}
		</kbd>
	);
}
