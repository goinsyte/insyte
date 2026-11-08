import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "../../components/sheet";
import { Maximize2, Plus, X } from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { InsyteMark } from "../ask/parts";
import { Thread } from "../ask/thread";
import { useAsk } from "./state";

/**
 * Ask Insyte, as a drawer beside whatever the operator is looking at.
 *
 * It sat on a mesh class the token rewrite had removed, so it opened as white ink on a white sheet.
 * Now it is a white drawer with the brand in a narrow Abyss band at its head — the mark, the name,
 * a new conversation, and the full page — and the thread under it is the same one /ask shows, so a
 * conversation can move from the drawer to the page without starting again.
 */
export function AskInsytePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
	const start = useAsk((s) => s.start);
	const navigate = useNavigate();
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-paper p-0 sm:max-w-[460px]">
				<header className="flex h-14 shrink-0 items-center gap-2.5 bg-abyss px-4 text-mesh-ink">
					<span className="flex size-7 items-center justify-center rounded-md bg-white/12">
						<InsyteMark size={18} />
					</span>
					<div className="flex min-w-0 flex-1 flex-col">
						<SheetTitle className="font-medium text-base text-mesh-ink leading-tight">Vraag Insyte</SheetTitle>
						<SheetDescription className="truncate text-xs text-mesh-ink-3 leading-tight">
							Werkt binnen jouw regels.
						</SheetDescription>
					</div>
					<HeadButton label="Nieuw gesprek" onClick={start}>
						<Plus className="size-4" strokeWidth={2} />
					</HeadButton>
					<HeadButton
						label="Volledige pagina openen"
						onClick={() => {
							onOpenChange(false);
							void navigate({ to: "/ask" });
						}}
					>
						<Maximize2 className="size-3.5" strokeWidth={2} />
					</HeadButton>
					<SheetClose asChild>
						<HeadButton label="Sluiten">
							<X className="size-4" strokeWidth={2} />
						</HeadButton>
					</SheetClose>
				</header>
				<Thread compact />
			</SheetContent>
		</Sheet>
	);
}

function HeadButton({ label, onClick, children, ...rest }: { label: string; onClick?: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			{...rest}
			className="flex size-8 cursor-pointer items-center justify-center rounded-md text-mesh-ink-2 transition-colors hover:bg-white/10 hover:text-mesh-ink"
		>
			{children}
		</button>
	);
}
