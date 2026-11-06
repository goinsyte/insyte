import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover";
import {
	type ChatAction,
	type ChatCommandId,
	type ChatRecordRef,
	chatProfiles,
	conversationDescription,
	conversations,
	messagesByConversation,
	type RichMessage,
	threadsByMessage,
} from "../../data-source";
import { ArrowDown, AtSign, Hash, Pin, Search, Settings as SettingsIcon } from "../../icons";
import { EmptyPage } from "../common/empty-page";
import { Field, FormDialog, TextField } from "../common/form-dialog";
import type { Conversation } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useChatStore } from "../stores/chat-store";
import { useOnCreate } from "../stores/create-intent";
import { useWorkspace } from "../stores/workspace-store";
import { mentionsIn } from "../tickets/mention-field";
import { type Attachment, forget, fromFiles } from "./attachments";
import { type ChatApi, ChatContext } from "./chat-context";
import { blocked, COMMAND, INSYTE, insyteAnswer, ME, mentionsInsyte, parseSlash, runAction } from "./commands";
import { Composer, type ComposerHandle } from "./composer";
import { continues, DayDivider, formatTime, groupByDay, MessageRow, NewDivider } from "./message-row";
import { Avatar, dmIdFor } from "./profile-card";
import { resolve, sameRef, usePools } from "./records";
import { RecordPanel, ThreadPanel } from "./side-panel";

/*
 * Chats, where the team talks and, since this page, works. A message can carry the app (a record
 * shared with #, a /command run in the open, Insyte asked by name) and the column on the right holds
 * whatever the conversation is about right now: a thread, or the record itself. The conversation
 * stays the place the team reads; the work it causes is written into it, with a way back.
 */

type Panel = { type: "thread"; id: string } | { type: "record"; stack: ChatRecordRef[] } | null;

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/* The conversations whose "Nieuw" line has been seen this session: opened once, then read. */
const READ = new Set<string>();

export function ChatsPage() {
	const search = useRouterState({ select: (s) => s.location.search }) as { id?: string };
	const navigate = useNavigate();
	const reduce = useReducedMotion() ?? false;
	const created = useChatStore((s) => s.created);
	const addConversation = useChatStore((s) => s.addConversation);
	const removeConversation = useChatStore((s) => s.removeConversation);
	const members = useWorkspace((s) => s.members);
	const all = useMemo(() => [...created, ...conversations], [created]);
	const [newChannel, setNewChannel] = useState(false);
	useOnCreate("channel", useCallback(() => setNewChannel(true), []));

	/* "Bericht" on a person opens their direct thread; the first time, that is a new one. */
	useEffect(() => {
		const id = search.id;
		if (!id?.startsWith("conv_dm_") || all.some((c) => c.id === id)) return;
		const key = id.slice("conv_dm_".length);
		const member = members.find((m) => m.id === key);
		const profile = chatProfiles[key];
		const name = member?.name ?? profile?.name;
		if (!name) return;
		addConversation({
			id,
			type: "dm",
			name,
			participants: [
				{ id: ME.id, name: ME.name },
				{ id: member ? member.id : key, name },
			],
			last_message_at: new Date().toISOString(),
			last_message_preview: "",
			unread_count: 0,
			messages: [],
		});
	}, [search.id, all, members, addConversation]);

	const first = all[0] ?? conversations[0];
	const active = ((search.id ? all.find((c) => c.id === search.id) : undefined) ?? first) as Conversation;
	const seeded = messagesByConversation[active.id] ?? [];

	const drafts = useChatStore((s) => s.drafts);
	const extra = useChatStore((s) => s.extra);
	const threadExtra = useChatStore((s) => s.threadExtra);
	const reactionsState = useChatStore((s) => s.reactions);
	const pinnedMessages = useChatStore((s) => s.pinnedMessages);
	const setDraft = useChatStore((s) => s.setDraft);
	const appendMessage = useChatStore((s) => s.appendMessage);
	const appendReply = useChatStore((s) => s.appendReply);
	const setReactions = useChatStore((s) => s.setReactions);
	const setTyping = useChatStore((s) => s.setTyping);
	const pools = usePools();
	const poolsRef = useRef(pools);
	poolsRef.current = pools;

	const messages = useMemo(() => [...seeded, ...(extra[active.id] ?? [])], [seeded, extra, active.id]);
	const repliesFor = useCallback((id: string) => [...(threadsByMessage[id] ?? []), ...(threadExtra[id] ?? [])], [threadExtra]);

	const [panel, setPanel] = useState<Panel>(null);
	useEffect(() => setPanel(null), [active.id]);
	const threadParent = panel?.type === "thread" ? (messages.find((m) => m.id === panel.id) ?? null) : null;
	const recordRef = panel?.type === "record" ? (panel.stack[panel.stack.length - 1] ?? null) : null;

	/* Pending attachments and records, per composer: the channel's, and each thread's. */
	const [pendingFiles, setPendingFiles] = useState<Record<string, Attachment[]>>({});
	const [pendingRecords, setPendingRecords] = useState<Record<string, ChatRecordRef[]>>({});
	const [threadDrafts, setThreadDrafts] = useState<Record<string, string>>({});
	const [alsoToChannel, setAlsoToChannel] = useState(false);
	const mainComposer = useRef<ComposerHandle>(null);
	const threadComposer = useRef<ComposerHandle>(null);

	const people = useMemo(
		() => members.filter((m) => m.status === "active").map((m) => ({ id: m.id, initial: m.name.charAt(0), name: m.name })),
		[members],
	);
	const handles = useMemo(() => new Set([...members.map((m) => (m.name.split(" ")[0] ?? m.name).toLowerCase()), "insyte"]), [members]);

	function post(where: string | null, msg: RichMessage) {
		if (where) appendReply(where, msg);
		else appendMessage(active.id, msg);
	}

	/** Sends what is in a composer: a command becomes its card, a question to Insyte gets an answer. */
	function send(parent: RichMessage | null) {
		const key = parent ? `${active.id}:${parent.id}` : active.id;
		const text = (parent ? (threadDrafts[parent.id] ?? "") : (drafts[active.id] ?? "")).trim();
		const records = pendingRecords[key] ?? [];
		const files = pendingFiles[key] ?? [];
		const clear = () => {
			if (parent) setThreadDrafts((d) => ({ ...d, [parent.id]: "" }));
			else setDraft(active.id, "");
			setPendingRecords((p) => ({ ...p, [key]: [] }));
			setPendingFiles((p) => ({ ...p, [key]: [] }));
		};
		const where = parent?.id ?? null;
		const base = { conversation_id: active.id, sender_id: ME.id, sender_name: ME.name, at: new Date().toISOString() };

		if (text.startsWith("/")) {
			const parsed = parseSlash(text, records, pools);
			if (!parsed) return void toast.error("Die opdracht ken ik niet. Typ / voor de lijst.");
			const why = blocked(parsed.command.id, parsed.record, parsed.arg);
			if (why) return void toast.error(why);
			const action: ChatAction = {
				id: newId("act"),
				command: parsed.command.id,
				...(parsed.target ? { target: parsed.target } : {}),
				...(parsed.arg ? { arg: parsed.arg } : {}),
				by: "person",
				state: parsed.command.money ? "confirm" : "running",
			};
			post(where, { ...base, id: newId("m"), body: "", action });
			clear();
			if (action.state === "running") void runAction(action, parsed.record);
			return;
		}

		if (!text && records.length === 0 && files.length === 0) return;
		const msg: RichMessage = {
			...base,
			id: newId("m"),
			body: text,
			...(records.length ? { records } : {}),
			...(files.length ? { attachments: files } : {}),
		};
		post(where, msg);
		if (parent && alsoToChannel) appendMessage(active.id, { ...msg, id: `${msg.id}_ch` });
		clear();

		const told = mentionsIn(text, people).filter((p) => p.id !== ME.memberId);
		if (told.length > 0)
			toast(`${new Intl.ListFormat("nl-NL", { type: "conjunction" }).format(told.map((p) => p.name.split(" ")[0] ?? p.name))} ${told.length === 1 ? "krijgt" : "krijgen"} een melding`);

		if (mentionsInsyte(text)) {
			const history = parent ? [parent, ...repliesFor(parent.id)] : messages;
			setTyping(key, "Insyte");
			window.setTimeout(
				() => {
					const reply = insyteAnswer(text, records.length ? records : (parent?.records ?? []), [...history, msg], poolsRef.current);
					post(where, {
						conversation_id: active.id,
						id: newId("m"),
						sender_id: INSYTE.id,
						sender_name: INSYTE.name,
						at: new Date().toISOString(),
						body: reply.body,
						...(reply.records?.length ? { records: reply.records } : {}),
						...(reply.action ? { action: reply.action } : {}),
					});
					setTyping(key, undefined);
					if (reply.action?.state === "running") void runAction(reply.action, reply.action.target ? resolve(reply.action.target, poolsRef.current) : null);
				},
				reduce ? 300 : 1300,
			);
		}
	}

	const api: ChatApi = {
		conversation: active,
		handles,
		openRecordRef: recordRef,
		openRecord: (ref) =>
			setPanel((p) => {
				if (p?.type === "record") {
					const top = p.stack[p.stack.length - 1];
					return top && sameRef(top, ref) ? p : { type: "record", stack: [...p.stack, ref].slice(-8) };
				}
				return { type: "record", stack: [ref] };
			}),
		openThread: (id) => setPanel({ type: "thread", id }),
		threadId: panel?.type === "thread" ? panel.id : null,
		mention: (handle) => {
			const target = panel?.type === "thread" ? threadComposer.current : mainComposer.current;
			target?.insert(`@${handle} `);
		},
		attach: (ref) => {
			setPendingRecords((p) => {
				const list = p[active.id] ?? [];
				return list.some((x) => sameRef(x, ref)) ? p : { ...p, [active.id]: [...list, ref] };
			});
			mainComposer.current?.focus();
		},
		toggleReaction: (m, emoji) => {
			const current = reactionsState[m.id] ?? m.reactions ?? [];
			const found = current.find((r) => r.emoji === emoji);
			const next = !found
				? [...current, { emoji, count: 1, mine: true }]
				: found.mine
					? current.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0)
					: current.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r));
			setReactions(m.id, next);
		},
		act: (command: ChatCommandId, ref, arg) => {
			const r = ref ? resolve(ref, pools) : null;
			const c = COMMAND[command];
			const resolvedArg = arg ?? (command === "ticket" && r ? `${r.code} · ${r.title}` : undefined);
			const action: ChatAction = {
				id: newId("act"),
				command,
				...(ref ? { target: ref } : {}),
				...(resolvedArg ? { arg: resolvedArg } : {}),
				by: "person",
				state: c.money ? "confirm" : "running",
			};
			appendMessage(active.id, { conversation_id: active.id, id: newId("m"), sender_id: ME.id, sender_name: ME.name, at: new Date().toISOString(), body: "", action });
			if (action.state === "running") void runAction(action, r);
			else toast(`${c.label}: bevestig op de kaart in #${active.name}`);
		},
		repliesFor,
	};

	/* The query in the header's search, and the message it should land on. */
	const [query, setQuery] = useState<string | null>(null);
	const [highlight, setHighlight] = useState<string | null>(null);
	const shown = query ? messages.filter((m) => m.body.toLowerCase().includes(query.toLowerCase())) : messages;
	const jump = (id: string) => {
		setQuery(null);
		setHighlight(id);
		requestAnimationFrame(() => document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }));
		window.setTimeout(() => setHighlight(null), 1800);
	};

	/* The "Nieuw" line sits above the seeded unread messages, the first time the conversation opens. */
	const [unreadFrom] = useState(() => new Map<string, string | undefined>());
	if (!unreadFrom.has(active.id)) {
		const n = READ.has(active.id) ? 0 : active.unread_count;
		unreadFrom.set(active.id, n > 0 ? seeded[Math.max(0, seeded.length - n)]?.id : undefined);
		READ.add(active.id);
	}

	const mainKey = active.id;
	const threadKey = threadParent ? `${active.id}:${threadParent.id}` : "";
	const placeholder = `Bericht aan ${active.type === "group" ? `#${active.name}` : active.name}`;

	return (
		<ChatContext.Provider value={api}>
			<div className="flex h-full min-h-0 bg-paper">
				<div className="flex min-w-0 flex-1 flex-col">
					<ChatHeader conversation={active} searching={query !== null} onSearch={() => setQuery((q) => (q === null ? "" : null))} pinned={messages.filter((m) => pinnedMessages.includes(m.id))} onJump={jump} />
					{query !== null ? (
						<div className="flex items-center gap-2 px-5 pb-2">
							<label className="field flex h-8 w-72 items-center gap-2 rounded-md px-2.5 focus-within:bg-paper">
								<Search className="size-3.5 shrink-0 text-ink-3" />
								<input
									autoFocus
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									onKeyDown={(e) => e.key === "Escape" && setQuery(null)}
									placeholder={`Zoeken in ${active.type === "group" ? `#${active.name}` : active.name}`}
									className="min-w-0 flex-1 bg-transparent text-ink text-sm outline-none placeholder:text-ink-3"
								/>
							</label>
							<span className="text-ink-3 text-sm tabular-nums">{query ? `${shown.length} van ${messages.length}` : ""}</span>
						</div>
					) : null}
					<MessagesArea messages={shown} unreadFrom={unreadFrom.get(active.id)} highlight={highlight} />
					<Composer
						handle={mainComposer}
						conversationId={mainKey}
						value={drafts[active.id] ?? ""}
						onChange={(v) => setDraft(active.id, v)}
						onSubmit={() => send(null)}
						placeholder={placeholder}
						people={people}
						attachments={pendingFiles[mainKey] ?? []}
						onAttach={(files) => setPendingFiles((p) => ({ ...p, [mainKey]: [...(p[mainKey] ?? []), ...fromFiles(files)] }))}
						onRemoveAttachment={(id) => {
							forget(id);
							setPendingFiles((p) => ({ ...p, [mainKey]: (p[mainKey] ?? []).filter((a) => a.id !== id) }));
						}}
						records={pendingRecords[mainKey] ?? []}
						onRecords={(refs) => setPendingRecords((p) => ({ ...p, [mainKey]: refs }))}
					/>
				</div>

				<AnimatePresence initial={false}>
					{panel ? (
						<motion.aside
							key="panel"
							aria-label={panel.type === "thread" ? "Thread" : "Record"}
							initial={reduce ? { opacity: 0 } : { width: 0, opacity: 0 }}
							animate={{ width: "var(--panel-w)", opacity: 1 }}
							exit={reduce ? { opacity: 0 } : { width: 0, opacity: 0 }}
							transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
							className="fixed inset-y-0 right-0 z-30 flex shrink-0 overflow-hidden bg-mist shadow-[-16px_0_32px_-24px_rgb(0_0_0/0.35)] [--panel-w:min(440px,100vw)] lg:static lg:z-auto lg:[--panel-w:400px] xl:[--panel-w:440px]"
						>
							<div className="h-full w-[var(--panel-w)] shrink-0">
								<AnimatePresence mode="wait" initial={false}>
									<motion.div
										key={panel.type === "thread" ? `t-${panel.id}` : `r-${recordRef?.kind}-${recordRef?.id}`}
										initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
										animate={{ opacity: 1, x: 0 }}
										exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
										transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
										className="h-full"
									>
										{panel.type === "thread" && threadParent ? (
											<ThreadPanel
												parent={threadParent}
												onClose={() => setPanel(null)}
												composer={
													<Composer
														compact
														handle={threadComposer}
														conversationId={threadKey}
														value={threadDrafts[threadParent.id] ?? ""}
														onChange={(v) => setThreadDrafts((d) => ({ ...d, [threadParent.id]: v }))}
														onSubmit={() => send(threadParent)}
														placeholder="Antwoorden…"
														people={people}
														attachments={pendingFiles[threadKey] ?? []}
														onAttach={(files) => setPendingFiles((p) => ({ ...p, [threadKey]: [...(p[threadKey] ?? []), ...fromFiles(files)] }))}
														onRemoveAttachment={(id) => setPendingFiles((p) => ({ ...p, [threadKey]: (p[threadKey] ?? []).filter((a) => a.id !== id) }))}
														records={pendingRecords[threadKey] ?? []}
														onRecords={(refs) => setPendingRecords((p) => ({ ...p, [threadKey]: refs }))}
														{...(active.type === "group" ? { alsoToChannel: { checked: alsoToChannel, onChange: setAlsoToChannel, channel: active.name } } : {})}
													/>
												}
											/>
										) : recordRef && panel.type === "record" ? (
											<RecordPanel
												refTo={recordRef}
												canBack={panel.stack.length > 1}
												onBack={() => setPanel({ type: "record", stack: panel.stack.slice(0, -1) })}
												onClose={() => setPanel(null)}
											/>
										) : null}
									</motion.div>
								</AnimatePresence>
							</div>
						</motion.aside>
					) : null}
				</AnimatePresence>
			</div>
			<NewChannelDialog
				open={newChannel}
				onOpenChange={setNewChannel}
				taken={all.map((c) => c.name)}
				onCreate={(name, topic) => {
					const id = `conv_ch_${Date.now().toString(36)}`;
					addConversation({
						id,
						type: "group",
						name,
						participants: [{ id: ME.id, name: ME.name }],
						last_message_at: new Date().toISOString(),
						last_message_preview: topic,
						unread_count: 0,
						messages: [],
					});
					navigate({ to: "/chats", search: { id } } as never);
					undoable(`#${name} aangemaakt`, () => removeConversation(id));
				}}
			/>
		</ChatContext.Provider>
	);
}

function ChatHeader({
	conversation,
	searching,
	onSearch,
	pinned,
	onJump,
}: {
	conversation: Conversation;
	searching: boolean;
	onSearch: () => void;
	pinned: RichMessage[];
	onJump: (id: string) => void;
}) {
	const pinnedConversation = useChatStore((s) => s.pinned.includes(conversation.id));
	const muted = useChatStore((s) => s.muted.includes(conversation.id));
	const togglePinned = useChatStore((s) => s.togglePinned);
	const toggleMuted = useChatStore((s) => s.toggleMuted);
	const navigate = useNavigate();
	const description = conversationDescription[conversation.id];
	const isGroup = conversation.type === "group";
	const faces = conversation.participants.slice(0, 3);

	return (
		<header className="flex h-14 shrink-0 items-center justify-between gap-3 px-5">
			<div className="flex min-w-0 items-center gap-2">
				<span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-arc-tint text-arc-ink">
					{isGroup ? <Hash className="size-4" strokeWidth={2} /> : <AtSign className="size-4" strokeWidth={2} />}
				</span>
				<h2 className="shrink-0 font-medium text-ink text-md">{conversation.name}</h2>
				{description ? <span className="hidden truncate text-ink-3 text-sm md:inline">{description.replace(/^\d+ teamleden · /, "")}</span> : null}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button type="button" aria-label="Leden" className="flex h-8 items-center gap-2 rounded-lg pr-2.5 pl-1.5 transition-colors hover:bg-ink/6 data-[popup-open]:bg-ink/6">
							<span className="flex -space-x-1.5">
								{faces.map((p) => (
									<span key={p.id} className="rounded-md ring-2 ring-paper">
										<Avatar senderId={p.id} name={p.name} size={20} />
									</span>
								))}
							</span>
							<span className="text-ink-2 text-sm tabular-nums">{conversation.participants.length}</span>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-60">
						<DropdownMenuLabel>In dit gesprek</DropdownMenuLabel>
						{conversation.participants.map((p) => (
							<DropdownMenuItem key={p.id} className="gap-2" disabled={p.id === ME.id} onClick={() => navigate({ to: "/chats", search: { id: dmIdFor(p.id) } } as never)}>
								<Avatar senderId={p.id} name={p.name} size={20} presence={chatProfiles[p.id]?.presence} />
								<span className="flex-1">{p.name}</span>
								<span className="text-ink-3 text-xs">{chatProfiles[p.id]?.title}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={`Vastgezette berichten (${pinned.length})`}
							title="Vastgezette berichten"
							className={cn("flex h-8 items-center gap-1 rounded-md px-2 transition-colors hover:bg-ink/6 data-[popup-open]:bg-ink/6", pinned.length ? "text-arc-ink" : "text-ink-2")}
						>
							<Pin className="size-4" strokeWidth={1.75} />
							{pinned.length ? <span className="text-sm tabular-nums">{pinned.length}</span> : null}
						</button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-80 p-2">
						<p className="px-2 pt-1 pb-2 font-medium text-ink text-sm">Vastgezet in #{conversation.name}</p>
						{pinned.length ? (
							<ul className="flex flex-col">
								{pinned.map((m) => (
									<li key={m.id}>
										<button type="button" onClick={() => onJump(m.id)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-arc-tint/60">
											<Avatar senderId={m.sender_id} name={m.sender_name} size={24} />
											<span className="flex min-w-0 flex-col">
												<span className="text-ink-3 text-xs">
													{m.sender_name} · {formatTime(m.at)}
												</span>
												<span className="line-clamp-2 text-ink text-sm">{m.body || (m.action ? COMMAND[m.action.command].label : "Record")}</span>
											</span>
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="px-2 pb-2 text-ink-3 text-sm">Zet een bericht vast via het menu bij het bericht.</p>
						)}
					</PopoverContent>
				</Popover>
				<button
					type="button"
					aria-label={searching ? "Zoeken sluiten" : "Berichten zoeken"}
					aria-pressed={searching}
					onClick={onSearch}
					className={cn("flex size-8 items-center justify-center rounded-md transition-colors hover:bg-ink/6 hover:text-ink", searching ? "bg-arc-tint text-arc-ink" : "text-ink-2")}
				>
					<Search className="size-4" strokeWidth={1.75} />
				</button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button type="button" aria-label="Gespreksinstellingen" className="flex size-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink data-[popup-open]:bg-ink/6">
							<SettingsIcon className="size-4" strokeWidth={1.75} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuCheckboxItem checked={muted} onCheckedChange={() => toggleMuted(conversation.id)}>
							Meldingen dempen
						</DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem
							checked={pinnedConversation}
							onCheckedChange={() => {
								togglePinned(conversation.id);
								toast(pinnedConversation ? `${conversation.name} losgemaakt` : `${conversation.name} bovenaan Chats vastgezet`);
							}}
						>
							Bovenaan Chats
						</DropdownMenuCheckboxItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
}

function MessagesArea({ messages, unreadFrom, highlight }: { messages: RichMessage[]; unreadFrom: string | undefined; highlight: string | null }) {
	const navigate = useNavigate();
	const grouped = useMemo(() => groupByDay(messages), [messages]);
	const scroller = useRef<HTMLDivElement>(null);
	const [away, setAway] = useState(false);
	const lastId = messages[messages.length - 1]?.id;
	const toEnd = (smooth: boolean) => {
		const el = scroller.current;
		if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
	};
	// A conversation opens at its latest message, and follows when one arrives.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the newest message changes
	useEffect(() => toEnd(false), [lastId]);

	if (messages.length === 0) {
		return (
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
				<EmptyPage
					kind="chats"
					count="0 berichten"
					title="Het is hier nog stil"
					body="Schrijf hieronder het eerste bericht, of nodig iemand uit."
					action={{ label: "Collega uitnodigen", onClick: () => void navigate({ to: "/settings/team" }) }}
				/>
			</div>
		);
	}

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<div
				ref={scroller}
				onScroll={(e) => {
					const el = e.currentTarget;
					setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 320);
				}}
				className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4"
			>
				{grouped.map((group) => (
					<div key={group.label} className="flex flex-col gap-0.5">
						<DayDivider label={group.label} />
						{group.messages.map((m, i) => (
							<div key={m.id}>
								{m.id === unreadFrom ? <NewDivider /> : null}
								<MessageRow message={m} continuation={m.id !== unreadFrom && continues(group.messages[i - 1], m)} highlight={highlight === m.id} />
							</div>
						))}
					</div>
				))}
			</div>
			<AnimatePresence>
				{away ? (
					<motion.button
						type="button"
						onClick={() => toEnd(true)}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 8 }}
						className="absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-abyss px-3.5 font-medium text-mesh-ink text-sm shadow-primary"
					>
						<ArrowDown className="size-3.5" strokeWidth={2} />
						Naar nieuwste
					</motion.button>
				) : null}
			</AnimatePresence>
		</div>
	);
}

function NewChannelDialog({
	open,
	onOpenChange,
	taken,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	taken: ReadonlyArray<string>;
	onCreate: (name: string, topic: string) => void;
}) {
	const [name, setName] = useState("");
	const [topic, setTopic] = useState("");
	const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	const clash = taken.includes(slug);
	return (
		<FormDialog
			open={open}
			onOpenChange={(v) => {
				if (!v) {
					setName("");
					setTopic("");
				}
				onOpenChange(v);
			}}
			title="Nieuw kanaal"
			description="Een plek voor één onderwerp. Nodig het team uit via de ledenlijst zodra het kanaal bestaat."
			primaryLabel="Kanaal aanmaken"
			disabled={slug === "" || clash}
			onSubmit={() => {
				onCreate(slug, topic.trim());
				setName("");
				setTopic("");
				onOpenChange(false);
			}}
		>
			<Field label="Naam" hint={clash ? `#${slug} bestaat al.` : slug ? `Wordt weergegeven als #${slug}` : undefined}>
				<TextField value={name} onChange={setName} placeholder="retouren" />
			</Field>
			<Field label="Onderwerp (optioneel)">
				<TextField value={topic} onChange={setTopic} placeholder="Waar dit kanaal voor is" />
			</Field>
		</FormDialog>
	);
}
