import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { Link, useNavigate } from "@tanstack/react-router";
import { useShellDialog } from "./shell-dialogs";
import { BudgetBar } from "../ai/budget-bar";
import {
	Building,
	Check,
	Plug,
	Wallet,
	CreditCard,
	DownloadCloud,
	Key,
	Keyboard,
	LogOut,
	Plus,
	Shield,
	UserCog,
	Users,
} from "../../icons";
import { toast } from "sonner";
import { personStyle } from "../lib/person-color";
import { initials } from "../lib/format";
import { useActiveStore, useAutonomy, useHasPage, usePersonaChrome, usePersonaSelection, useShellData } from "./state";

const MENU_ICON = {
	profile: UserCog,
	plug: Plug,
	wallet: Wallet,
	building: Building,
	users: Users,
	card: CreditCard,
	download: DownloadCloud,
	shield: Shield,
	key: Key,
} as const;

/**
 * The account tile, at the foot of the rail.
 *
 * `arc-soft` rather than the `#9cc3f8` that used to be hardcoded here — a sky blue from no palette,
 * in a file whose whole subject is the one person using the product. It also no longer draws its own
 * focus ring or reaches for the display face: the document owns the ring and the display face is for
 * figures.
 */
export function AvatarMenu({ side = "bottom" }: { side?: "top" | "right" | "bottom" | "left" }) {
	const { persona } = usePersonaSelection();
	const user = useShellData().currentUserByPersona[persona];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Accountmenu"
					className="flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-xs leading-none outline-none"
					style={personStyle(user.id)}
				>
					{initials(user.name)}
				</button>
			</DropdownMenuTrigger>
			<AvatarMenuContent align="end" side={side} />
		</DropdownMenu>
	);
}

const STORE_ACCENT = ["var(--abyss)", "var(--arc)", "var(--signal-green)"];

export function AvatarMenuContent({
	align = "end",
	side,
	includeStores = false,
}: {
	align?: "start" | "center" | "end";
	side?: "top" | "right" | "bottom" | "left";
	includeStores?: boolean;
}) {
	const { persona } = usePersonaSelection();
	const chrome = usePersonaChrome(persona);
	const hasPage = useHasPage();
	const admin = persona === "admin";
	const user = useShellData().currentUserByPersona[persona];
	const { active, stores, setActive } = useActiveStore();
	const show = useShellDialog((s) => s.show);
	const navigate = useNavigate();

	return (
		<DropdownMenuContent
			align={align}
			side={side}
			sideOffset={8}
			className="w-[280px] gap-0 overflow-hidden p-0"
		>
			<div className="flex items-center gap-2.5 border-hairline border-b p-3">
				<span
					className="flex size-9 items-center justify-center rounded-full font-medium text-base"
					style={personStyle(user.id)}
				>
					{initials(user.name)}
				</span>
				<div className="flex min-w-0 flex-col">
					<span className="truncate font-medium text-base text-ink">
						{user.name}
					</span>
					<span className="truncate text-sm text-ink-3 leading-[1.4]">
						{user.email}
					</span>
				</div>
			</div>

			<div className="px-1 pt-1 pb-1">
				<div className="px-2 pt-1 pb-1 font-medium text-xs text-ink-2 leading-none tracking-[-0.05px]">
					{admin ? active?.name : chrome.partner?.name}
				</div>
				{chrome.menu.filter((m) => hasPage(m.to)).map((m) => {
					const Icon = MENU_ICON[m.icon];
					return (
						<DropdownMenuItem key={m.to} asChild>
							<Link to={m.to} search={m.to === "/data" ? ({ view: "import" } as never) : undefined}>
								<Icon className="size-3.5" />
								{m.label}
							</Link>
						</DropdownMenuItem>
					);
				})}
			</div>

			{admin ? <AiSpendItem /> : null}

			{admin && includeStores && stores.length > 0 ? (
				<>
					<DropdownMenuSeparator />
					<div className="px-1 pt-1 pb-1">
						<div className="px-2 pt-1 pb-1 font-medium text-xs text-ink-2 leading-none tracking-[-0.05px]">
							Winkels
						</div>
						{stores.map((s, i) => {
							const init = s.name
								.split(/\s+/)
								.map((w) => w[0])
								.slice(0, 2)
								.join("")
								.toUpperCase();
							const isActive = s.id === active?.id;
							return (
								<DropdownMenuItem
									key={s.id}
									onClick={() => {
										setActive(s.id);
										toast.success(`Overgeschakeld naar ${s.name}`);
									}}
								>
									<span
										className="flex size-5 shrink-0 items-center justify-center rounded-md font-medium text-2xs text-mesh-ink"
										style={{
											backgroundColor:
												STORE_ACCENT[i % STORE_ACCENT.length] ?? "var(--ink-4)",
										}}
									>
										{init}
									</span>
									<span className="flex-1 truncate">{s.name}</span>
									{isActive ? (
										<Check
											className="size-3.5 shrink-0 text-arc-ink"
											strokeWidth={2.5}
										/>
									) : null}
								</DropdownMenuItem>
							);
						})}
						<DropdownMenuItem onClick={() => show({ kind: "connect-store" })}>
							<Plus className="size-3.5" />
							Winkel toevoegen
						</DropdownMenuItem>
					</div>
				</>
			) : null}

			<DropdownMenuSeparator />

			<div className="px-1 pb-1">
				<div className="px-2 pt-1 pb-1 font-medium text-xs text-ink-2 leading-none tracking-[-0.05px]">
					Account
				</div>
				{admin ? (
					<>
						<DropdownMenuItem asChild>
							<Link to={"/settings/profile" as never}>
								<UserCog className="size-3.5" />
								Profiel bewerken
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link to={"/settings/security" as never}>
								<Shield className="size-3.5" />
								Beveiliging
							</Link>
						</DropdownMenuItem>
					</>
				) : null}
				<DropdownMenuItem onClick={() => show({ kind: "shortcuts" })}>
					<Keyboard className="size-3.5" />
					Sneltoetsen
				</DropdownMenuItem>
				{admin ? (
					<DropdownMenuItem asChild>
						<Link to="/settings/api-keys">
							<Key className="size-3.5" />
							API-koppelingen
						</Link>
					</DropdownMenuItem>
				) : null}
			</div>

			<DropdownMenuSeparator />

			<div className="px-1 pb-1">
				<DropdownMenuItem
					variant="destructive"
					onClick={() => {
						// No session to end in the demo: going to sign-in is the whole of logging out.
						toast("Uitgelogd");
						void navigate({ to: "/login" });
					}}
				>
					<LogOut className="size-3.5" />
					Uitloggen
				</DropdownMenuItem>
			</div>
		</DropdownMenuContent>
	);
}

/** "Insyte AI deze maand: €38 van €120", the month's spend as one line that opens Limieten. */
function AiSpendItem() {
	const budget = useAutonomy((s) => s.budget);
	return (
		<div className="px-1 pb-1">
			<DropdownMenuItem asChild>
				<Link to={"/settings/ai/limits" as never} className="flex flex-col items-stretch gap-1.5">
					<span className="text-sm text-ink-2">Insyte AI deze maand</span>
					<BudgetBar used={budget.used} limit={budget.limit} />
				</Link>
			</DropdownMenuItem>
		</div>
	);
}
