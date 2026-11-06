import { ArrowUp, AtSign, CornerDownLeft, type IconComponent, ShoppingBag, Slash } from "../../icons";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { COMMANDS } from "../lib/ask/scripts";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";

/**
 * The composer, after beautifului's Prompt Bar: a white well that grows with what is typed, `@` to
 * name a record and `/` for a command, each opening a short list above the well that the arrows
 * and Enter work, and a toolbar under it saying what Insyte can see from where the operator is.
 * Enter sends; Shift+Enter is a new line.
 */

export type PromptBarHandle = { fill: (text: string) => void; focus: () => void };

type Suggestion = { key: string; label: string; hint: string; icon: IconComponent; insert: string };

const PLACES: Record<string, string> = {
	dashboard: "Start",
	orders: "Bestellingen",
	tickets: "Tickets",
	chargebacks: "Chargebacks",
	customers: "Klanten",
	products: "Producten",
	inbox: "Inbox",
	settings: "Instellingen",
	ask: "Vraag Insyte",
};

export const PromptBar = forwardRef<PromptBarHandle, { onSend: (text: string) => void; busy?: boolean; autoFocus?: boolean }>(
	function PromptBar({ onSend, busy = false, autoFocus = false }, ref) {
		const [text, setText] = useState("");
		const [cursor, setCursor] = useState(0);
		const [active, setActive] = useState(0);
		const area = useRef<HTMLTextAreaElement>(null);
		const orders = useWorkspace((s) => s.orders);
		const chargebacks = useWorkspace((s) => s.chargebacks);
		const where = useRouterState({ select: (s) => s.location.pathname.split("/")[1] ?? "" });

		useImperativeHandle(ref, () => ({
			fill: (t) => {
				setText(t);
				requestAnimationFrame(() => {
					area.current?.focus();
					area.current?.setSelectionRange(t.length, t.length);
				});
			},
			focus: () => area.current?.focus(),
		}));

		/* What is being typed at the caret: "@so-12" or "/dra", or nothing. */
		const trigger = useMemo(() => {
			const before = text.slice(0, cursor);
			const m = /(^|\s)([@/])([\w-]*)$/.exec(before);
			if (!m) return null;
			if (m[2] === "/" && before.trim() !== `/${m[3] ?? ""}`) return null;
			return { sign: m[2] as "@" | "/", query: (m[3] ?? "").toLowerCase(), start: before.length - (m[3]?.length ?? 0) - 1 };
		}, [text, cursor]);

		const suggestions: Suggestion[] = useMemo(() => {
			if (!trigger) return [];
			if (trigger.sign === "/") {
				return COMMANDS.filter((c) => c.name.startsWith(trigger.query)).map((c) => ({
					key: c.name,
					label: `/${c.name}`,
					hint: c.hint,
					icon: Slash,
					insert: `/${c.name} `,
				}));
			}
			const records = [
				...orders.filter((o) => o.tags.includes("at_risk")).map((o) => ({ ref: o.number, hint: `${o.customer_name} · vertraagd`, icon: ShoppingBag })),
				...chargebacks.map((c) => ({ ref: c.case_number, hint: `${c.customer_name} · ${c.provider}`, icon: CornerDownLeft })),
				...orders.filter((o) => !o.tags.includes("at_risk")).map((o) => ({ ref: o.number, hint: o.customer_name, icon: ShoppingBag })),
			];
			return records
				.filter((r) => r.ref.toLowerCase().includes(trigger.query) || r.hint.toLowerCase().includes(trigger.query))
				.slice(0, 6)
				.map((r) => ({ key: r.ref, label: r.ref, hint: r.hint, icon: r.icon, insert: `@${r.ref} ` }));
		}, [trigger, orders, chargebacks]);

		function choose(s: Suggestion) {
			if (!trigger) return;
			const next = text.slice(0, trigger.start) + s.insert + text.slice(cursor);
			const at = trigger.start + s.insert.length;
			setText(next);
			setCursor(at);
			setActive(0);
			requestAnimationFrame(() => area.current?.setSelectionRange(at, at));
		}

		function send() {
			if (text.trim() === "" || busy) return;
			onSend(text);
			setText("");
			setCursor(0);
		}

		function insertSign(sign: "@" | "/") {
			const next = sign === "/" ? "/" : `${text}${text === "" || text.endsWith(" ") ? "" : " "}@`;
			setText(next);
			setCursor(next.length);
			requestAnimationFrame(() => {
				area.current?.focus();
				area.current?.setSelectionRange(next.length, next.length);
			});
		}

		return (
			<div className="relative">
				<AnimatePresence>
					{suggestions.length > 0 ? (
						<motion.ul
							role="listbox"
							aria-label={trigger?.sign === "/" ? "Opdrachten" : "Records"}
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
							transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
							className="panel-raised absolute right-0 bottom-full left-0 z-20 mb-1.5 flex flex-col rounded-xl bg-paper p-1"
						>
							<li className="px-2 pt-1 pb-1 text-xs text-ink-3">{trigger?.sign === "/" ? "Opdrachten" : "Record vermelden"}</li>
							{suggestions.map((s, i) => {
								const Icon = s.icon;
								return (
									<li key={s.key} role="option" aria-selected={i === active}>
										<button
											type="button"
											onMouseDown={(e) => {
												e.preventDefault();
												choose(s);
											}}
											onMouseEnter={() => setActive(i)}
											className={cn(
												"flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-base",
												i === active ? "bg-ink/6 text-ink" : "text-ink-2",
											)}
										>
											<Icon className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
											<span className="font-medium tabular-nums">{s.label}</span>
											<span className="min-w-0 flex-1 truncate text-sm text-ink-3">{s.hint}</span>
										</button>
									</li>
								);
							})}
						</motion.ul>
					) : null}
				</AnimatePresence>

				<div className="flex flex-col rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_10%,transparent),0_1px_2px_rgb(0_0_0/0.04)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--arc),0_0_0_3px_var(--arc-soft)]">
					<textarea
						ref={area}
						// biome-ignore lint/a11y/noAutofocus: the composer is what the operator opened Ask Insyte to use
						autoFocus={autoFocus}
						rows={1}
						value={text}
						aria-label="Vraag Insyte"
						placeholder="Vraag naar bestellingen, tickets of chargebacks"
						onChange={(e) => {
							setText(e.target.value);
							setCursor(e.target.selectionStart);
							setActive(0);
						}}
						onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
						onKeyDown={(e) => {
							if (suggestions.length > 0) {
								if (e.key === "ArrowDown") {
									e.preventDefault();
									setActive((a) => (a + 1) % suggestions.length);
									return;
								}
								if (e.key === "ArrowUp") {
									e.preventDefault();
									setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
									return;
								}
								if (e.key === "Enter" || e.key === "Tab") {
									e.preventDefault();
									const s = suggestions[active];
									if (s) choose(s);
									return;
								}
							}
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								send();
							}
						}}
						className="field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-base text-ink outline-none placeholder:text-ink-3"
					/>
					<div className="flex items-center gap-1 px-2 pb-2">
						<ToolButton label="Record vermelden" onClick={() => insertSign("@")}>
							<AtSign className="size-3.5" strokeWidth={1.75} />
						</ToolButton>
						<ToolButton label="Opdrachten" onClick={() => insertSign("/")}>
							<Slash className="size-3.5" strokeWidth={1.75} />
						</ToolButton>
						<span className="ml-1 truncate text-xs text-ink-3">
							Ziet {PLACES[where] ?? "deze pagina"}, je wachtrij en records · werkt binnen jouw regels
						</span>
						<button
							type="button"
							onClick={send}
							disabled={text.trim() === "" || busy}
							aria-label="Versturen"
							className="ml-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-abyss text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none"
						>
							<ArrowUp className="size-4" strokeWidth={2} />
						</button>
					</div>
				</div>
			</div>
		);
	},
);

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className="flex size-7 cursor-pointer items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
		>
			{children}
		</button>
	);
}
