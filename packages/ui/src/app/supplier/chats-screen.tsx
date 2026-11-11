import { getRouteApi } from "@tanstack/react-router";
import { Paperclip, Send } from "../../icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Attachment, AttachmentTile, forget, fromFiles, PendingAttachments } from "../chats/attachments";
import { seedRefOf } from "../chats/demo-records";
import { MessageBody } from "../chats/message-body";
import { PageHeader } from "../common/page-header";
import { MentionField, mentionsIn } from "../tickets/mention-field";
import { useSupplierOrders } from "../hooks/use-supplier-orders";
import { messagesByConversation, type RichMessage } from "../../data-source";
import { personStyle } from "../lib/person-color";
import { cn } from "../lib/utils";
import { useChatStore } from "../stores/chat-store";
import { toast } from "sonner";

const Route = getRouteApi("/_supplier/supplier/chats/");

/** The one conversation a supplier has: Northwind's #allure-fulfillment, the same thread the brand reads. */
const CONV = "conv_supplier_allure";
const ME = { id: "u_marco", name: "Marco Rossi" };
const TEAM = [
	{ id: "u_elena", initial: "E", name: "Elena Hart" },
	{ id: "u_sofia", initial: "S", name: "Sofía K." },
];
const HANDLES = new Set(TEAM.map((t) => (t.name.split(" ")[0] ?? t.name).toLowerCase()));
const when = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/*
 * Chat with the brand. It is the brand's own supplier channel, not a copy: what Marco sends lands
 * in Northwind's #allure-fulfillment and what the team writes there shows here. Order numbers turn
 * into links to the supplier's side of that order; quick lines cover what a supplier says most.
 */
export function SupplierChat() {
	const ref = Route.useSearch().ref;
	const extra = useChatStore((s) => s.extra[CONV]);
	const append = useChatStore((s) => s.appendMessage);
	const orders = useSupplierOrders();
	const thread = useMemo(() => [...(messagesByConversation[CONV] ?? []), ...(extra ?? [])], [extra]);
	const [draft, setDraft] = useState(ref ? `Over ${ref}: ` : "");
	const [files, setFiles] = useState<Attachment[]>([]);
	const list = useRef<HTMLDivElement>(null);
	const file = useRef<HTMLInputElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: follow the newest message
	useEffect(() => {
		if (list.current) list.current.scrollTop = list.current.scrollHeight;
	}, [thread.length]);

	const late = orders.filter((r) => r.due === "late" && (r.status === "to_ship" || r.status === "to_accept"))[0];
	const shipped = orders.filter((r) => r.status === "shipped" && r.work?.parcels.length)[0];
	const QUICK = [
		shipped ? `${shipped.number} is verzonden met ${shipped.work!.parcels[0]!.carrier} · ${shipped.work!.parcels[0]!.tracking}.` : "Alles van vandaag is verzonden.",
		late ? `${late.number} loopt vertraging op, ik laat de nieuwe datum vandaag weten.` : "Geen vertragingen vandaag.",
		"Kunnen jullie het adres van deze bestelling bevestigen?",
	];

	function send() {
		const body = draft.trim();
		if (!body && files.length === 0) return;
		const msg: RichMessage = {
			id: `sm_${Date.now()}`,
			conversation_id: CONV,
			sender_id: ME.id,
			sender_name: ME.name,
			body,
			at: new Date().toISOString(),
			...(files.length > 0 ? { attachments: files } : {}),
		};
		append(CONV, msg);
		setDraft("");
		setFiles([]);
		const told = mentionsIn(body, TEAM);
		toast(told.length > 0 ? `Verstuurd · ${told.map((t) => t.name.split(" ")[0]).join(" en ")} ${told.length === 1 ? "krijgt" : "krijgen"} een melding` : "Verstuurd naar Northwind");
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader title="Chat met Northwind" meta="Elena Hart en Sofía K. lezen mee in #allure-fulfillment" />
			<div ref={list} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-5 py-4">
				{thread.map((m, i) => {
					const mine = m.sender_id === ME.id;
					const prev = thread[i - 1];
					const cont = prev?.sender_id === m.sender_id && Date.parse(m.at) - Date.parse(prev.at) < 10 * 60_000;
					return (
						<div key={m.id} className={cn("flex max-w-[68ch] gap-3", cont ? "pt-0.5" : "pt-3", mine && "self-end flex-row-reverse")}>
							<span className="w-8 shrink-0">
								{cont ? null : (
									<span className="flex size-8 items-center justify-center rounded-full font-medium text-sm" style={personStyle(m.sender_id)}>
										{m.sender_name.charAt(0)}
									</span>
								)}
							</span>
							<div className={cn("flex min-w-0 flex-col gap-1", mine && "items-end")}>
								{cont ? null : (
									<span className="flex items-baseline gap-2 text-sm">
										<span className="font-medium text-ink">{mine ? "Jij" : m.sender_name}</span>
										<span className="text-ink-3 text-xs tabular-nums">{when.format(new Date(m.at))}</span>
									</span>
								)}
								{m.body ? (
									<div className={cn("rounded-xl px-3.5 py-2", mine ? "bg-arc-tint" : "bg-mist")}>
										<MessageBody body={m.body} handles={HANDLES} orderBase="/supplier/orders" refOf={seedRefOf} />
									</div>
								) : null}
								{m.attachments?.length ? (
									<div className="flex flex-wrap gap-2">
										{m.attachments.map((a) => (
											<AttachmentTile key={a.id} a={a} />
										))}
									</div>
								) : null}
							</div>
						</div>
					);
				})}
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					send();
				}}
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					setFiles((f) => [...f, ...fromFiles(e.dataTransfer.files)]);
				}}
				className="flex shrink-0 flex-col gap-2 bg-mist p-3"
			>
				<ul aria-label="Snelle berichten" className="flex flex-wrap gap-1.5">
					{QUICK.map((q) => (
						<li key={q}>
							<button
								type="button"
								onClick={() => setDraft(q)}
								className="max-w-[44ch] cursor-pointer truncate rounded-full bg-paper px-3 py-1 text-ink-2 text-sm hover:text-ink"
							>
								{q}
							</button>
						</li>
					))}
				</ul>
				<div className="flex flex-col rounded-xl bg-paper">
					<PendingAttachments
						items={files}
						onRemove={(id) => {
							forget(id);
							setFiles((f) => f.filter((x) => x.id !== id));
						}}
					/>
					<MentionField
						value={draft}
						onChange={setDraft}
						onSubmit={send}
						people={TEAM}
						rows={2}
						placement="above"
						placeholder="Bericht aan Northwind · @ om iemand te vermelden"
						className="w-full resize-none rounded-xl bg-transparent px-3 pt-3 text-base text-ink leading-[1.5] outline-none placeholder:text-ink-3"
					/>
					<div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
						<button
							type="button"
							aria-label="Bestanden bijvoegen"
							title="Bestanden bijvoegen"
							onClick={() => file.current?.click()}
							className="flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink"
						>
							<Paperclip className="size-4" strokeWidth={1.75} />
						</button>
						<input
							ref={file}
							type="file"
							multiple
							className="hidden"
							onChange={(e) => {
								if (e.target.files) setFiles((f) => [...f, ...fromFiles(e.target.files!)]);
								e.target.value = "";
							}}
						/>
						<button
							type="submit"
							disabled={!draft.trim() && files.length === 0}
							className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3.5 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2 disabled:cursor-default disabled:opacity-40"
						>
							<Send className="size-3.5" strokeWidth={2} />
							Versturen
						</button>
					</div>
				</div>
			</form>
		</div>
	);
}
