import { RotateCcw } from "../../icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import {
	CornerDownLeft,
	type IconComponent,
	Mail,
	MessagesSquare,
	Package,
	Plus,
	ShoppingBag,
	Ticket,
	User,
	Workflow,
} from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { CREATE_ROUTE, type CreateKind, useCreateIntent } from "../stores/create-intent";

/** Everything the console can make, in the order an operator reaches for it. */
export const CREATE_ITEMS: ReadonlyArray<{ kind: CreateKind; label: string; newLabel: string; icon: IconComponent }> = [
	{ kind: "order", label: "Conceptbestelling", newLabel: "Nieuwe conceptbestelling", icon: ShoppingBag },
	{ kind: "return", label: "Retour", newLabel: "Retour starten", icon: RotateCcw },
	{ kind: "ticket", label: "Ticket", newLabel: "Nieuw ticket", icon: Ticket },
	{ kind: "customer", label: "Klant", newLabel: "Nieuwe klant", icon: User },
	{ kind: "product", label: "Product", newLabel: "Nieuw product", icon: Package },
	{ kind: "evidence", label: "Bewijspakket", newLabel: "Nieuw bewijspakket", icon: CornerDownLeft },
	{ kind: "automation", label: "Automatisering", newLabel: "Nieuwe automatisering", icon: Workflow },
	{ kind: "thread", label: "E-mail", newLabel: "Nieuwe e-mail", icon: Mail },
	{ kind: "channel", label: "Chatkanaal", newLabel: "Nieuw chatkanaal", icon: MessagesSquare },
];

/** Ask the page that makes `kind` to open its create dialog, going there first. */
export function useStartCreate() {
	const navigate = useNavigate();
	return (kind: CreateKind) => {
		useCreateIntent.getState().request(kind);
		void navigate({ to: CREATE_ROUTE[kind] });
	};
}

/** The top bar's +: a short menu of what can be made, each opening the dialog on its own page. */
export function NewMenu() {
	const start = useStartCreate();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Nieuw"
					title="Nieuw"
					className="hidden size-[30px] cursor-pointer items-center justify-center rounded-md bg-ink/6 text-ink-2 transition-colors hover:bg-ink/10 hover:text-ink sm:flex"
				>
					<Plus className="size-4" strokeWidth={2} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuLabel>Nieuw</DropdownMenuLabel>
				{CREATE_ITEMS.map((c) => (
					<DropdownMenuItem key={c.kind} onClick={() => start(c.kind)}>
						<c.icon className="size-3.5 text-ink-3" strokeWidth={1.75} />
						{c.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
