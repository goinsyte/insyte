import { Switch } from "../../components/switch";
import { ArrowRight, Check, Eye, EyeOff, Image, Loader, Mail, ShieldCheck, X } from "../../icons";
import { Link, useNavigate, getRouteApi } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FormError } from "../common/form-error";
import { Heading, INPUT, InviteShell, Label, PRIMARY, SECONDARY, Steps } from "./invite-shell";
import { GoogleButton, OAuthDivider } from "../onboarding/oauth-buttons";
import { Segmented } from "../team/bits";
import { roleLabel, useAbilities, useStoreAccessLabel } from "../team/roles";
import { setPersonaSelection } from "../hooks/use-persona";
import { formatDate, formatRelative, initials } from "../lib/format";
import { appHref } from "../../data-source/hrefs";
import { type Landing, resolveInvitation, SIGNED_IN_AS } from "../lib/invitations";
import { PORTAL_SCOPES } from "../lib/team";
import { cn } from "../lib/utils";
import { useProgram } from "../stores/affiliate-program-store";
import { useSettings } from "../stores/settings-store";
import { useSeats, useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";

const Route = getRouteApi("/invitations/$invitationId");

type Phase = "invite" | "photo" | "notify" | "requested";

const PERSON_FIELDS = ["var(--person-1)", "var(--person-2)", "var(--person-3)", "var(--person-4)", "var(--person-5)", "var(--person-6)"];

/**
 * Where an invitation link lands, in every state it can be in.
 *
 * The page always says the same three things first — whose workspace, who asked, and as what, with
 * what that role may do — and then the one thing to do about it: make an account, sign in, switch
 * account, continue with the company's Google Workspace, or, when the link no longer works, ask for a
 * new one. A new person joins in three short steps (account, photo, notifications) and lands in the
 * workspace with a note from the top bar. A supplier or affiliate makes the account here and carries
 * on in their own onboarding.
 */
export function InvitationPage() {
	const { invitationId } = Route.useParams();
	// Resolved once: accepting changes the stores, and the page should not flip state under itself.
	const inv = useMemo(() => resolveInvitation(invitationId), [invitationId]);
	const [phase, setPhase] = useState<Phase>("invite");
	const [state, setState] = useState(inv.state);
	const [name, setName] = useState(inv.name ?? "");
	const [photo, setPhoto] = useState<string | undefined>();
	const [field, setField] = useState(0);
	const navigate = useNavigate();
	const roles = useSettings((s) => s.roles);
	const role = inv.roleId ? roleLabel(roles, inv.roleId) : "";

	const line = brandLine(inv, state);

	function enter(notify: { on: number; email: boolean }) {
		const who = name.trim() || inv.name || inv.email || "collega";
		setPersonaSelection("admin");
		if (inv.state === "other-account") {
			// The invitation is to another workspace: it joins the switcher and the console moves there.
			const team = useTeam.getState();
			const pending = team.workspaceInvites.find((w) => w.workspace === inv.workspace);
			const ws = pending ? team.acceptWorkspaceInvite(pending.id) : team.addWorkspace(inv.workspace);
			if (ws && !pending) useTeam.setState((s) => ({ workspaces: s.workspaces.map((w) => (w.id === ws.id ? { ...w, own: false, role } : w)) }));
			if (ws) useTeam.getState().switchWorkspace(ws.id);
			void navigate({ to: "/dashboard", search: {} as never });
			return;
		}
		join(inv, who, role);
		useTeam.getState().setWelcome({ name: who, workspace: inv.workspace, role });
		toast.success(`Je zit in ${inv.workspace}`, {
			description: notify.on === 0 ? "Meldingen staan uit. Je zet ze aan in je profiel." : `${notify.on} soorten meldingen aan, in Insyte${notify.email ? " en per e-mail" : ""}.`,
		});
		void navigate({ to: "/dashboard", search: {} as never });
	}

	function toOnboarding() {
		const who = name.trim() || inv.name || inv.company || "";
		if (state === "supplier" && inv.supplierId) {
			const team = useTeam.getState();
			const p = team.portal[inv.supplierId];
			if (p) team.setPortal(inv.supplierId, { ...p, status: "active", contact: who });
			setPersonaSelection("supplier");
			toast.success(`Account gemaakt voor ${inv.company}`, { description: "Nog drie vragen en je ziet je eerste bestellingen." });
			void navigate({ to: "/onboarding", search: { persona: "supplier", step: 3 } });
			return;
		}
		if (inv.affiliateInviteId) useProgram.getState().acceptInvite(inv.affiliateInviteId);
		setPersonaSelection("affiliate");
		toast.success("Account gemaakt", { description: `Je start op ${inv.tier?.label ?? "Brons"}. Nog twee vragen.` });
		void navigate({ to: "/onboarding", search: { persona: "affiliate", step: 3 } });
	}

	const stepKey = `${state}-${phase}`;

	if (phase === "photo") {
		return (
			<InviteShell workspace={inv.workspace} line={line} stepKey={stepKey}>
				<Steps index={1} total={3} />
				<PhotoStep name={name || inv.name || ""} photo={photo} setPhoto={setPhoto} field={field} setField={setField} onNext={() => setPhase("notify")} onBack={() => setPhase("invite")} />
			</InviteShell>
		);
	}
	if (phase === "notify") {
		return (
			<InviteShell workspace={inv.workspace} line={line} stepKey={stepKey}>
				<Steps index={2} total={3} />
				<NotifyStep workspace={inv.workspace} onDone={enter} onBack={() => setPhase(state === "sso" ? "invite" : "photo")} />
			</InviteShell>
		);
	}

	return (
		<InviteShell workspace={inv.workspace} line={line} stepKey={stepKey}>
			{state === "new" || state === "link" || state === "sso" ? <Steps index={0} total={3} /> : null}
			<Body
				inv={inv}
				state={state}
				role={role}
				phase={phase}
				name={name}
				setName={setName}
				onJoinNew={() => setPhase("photo")}
				onJoinSso={() => setPhase("notify")}
				onSignedIn={() => enter({ on: 3, email: false })}
				onOnboard={toOnboarding}
				onRequest={() => setPhase("requested")}
				setState={setState}
			/>
		</InviteShell>
	);
}

/** Adds the person to the workspace, from the invitation that brought them. */
function join(inv: Landing, name: string, role: string) {
	const team = useTeam.getState();
	if (inv.teamInviteId) {
		team.acceptInvite(inv.teamInviteId, name);
		return;
	}
	const ws = useWorkspace.getState();
	const id = inv.id === "inv_nieuw" ? "mem_amber" : `mem_${inv.id}`;
	const member = { id, user_id: `user_${id}`, name, email: inv.email ?? "", role, status: "active" as const, last_active_at: new Date().toISOString() };
	useWorkspace.setState({ members: ws.members.some((m) => m.id === id) ? ws.members.map((m) => (m.id === id ? member : m)) : [...ws.members, member] });
	useTeam.setState((s) => ({
		invites: s.invites.filter((i) => i.email !== inv.email),
		memberMeta: { ...s.memberMeta, [id]: { stores: inv.stores, invitedBy: inv.inviter.id, joinedAt: Date.now(), lastSeen: Date.now() } },
	}));
}

function brandLine(inv: Landing, state: string) {
	if (state === "supplier") return { lead: "Lever aan", accent: inv.workspace, body: "Je ziet alleen de bestellingen met jullie producten en wat Northwind daarvoor betaalt. Nooit de gegevens van hun klanten." };
	if (state === "affiliate") return { lead: "Verdien mee met", accent: inv.workspace, body: `${inv.tier?.rate ?? 10}% commissie op elke bestelling via jouw code, op de 15e van de maand erna uitbetaald.` };
	if (state === "expired" || state === "revoked" || state === "missing") return { lead: "Deze link", accent: "werkt niet meer.", body: "Een uitnodiging is persoonlijk en tijdelijk. Wie je uitnodigde, kan in een klik een nieuwe sturen." };
	if (state === "accepted") return { lead: "Je zit al in", accent: inv.workspace, body: "Log in en je gaat verder waar je gebleven was." };
	if (state === "full") return { lead: "Bijna binnen bij", accent: inv.workspace, body: "Het abonnement van deze werkruimte heeft geen vrije plek. Eén klik en de eigenaar weet het." };
	return { lead: "Kom erbij in", accent: inv.workspace, body: "Bestellingen, tickets, chats en chargebacks van het hele team in één wachtrij. Insyte doet het werk, binnen de regels van jullie team." };
}

/* ── the invitation itself, and what to do about it ────────────────────────────────────────────── */

function Body({
	inv,
	state,
	role,
	phase,
	name,
	setName,
	onJoinNew,
	onJoinSso,
	onSignedIn,
	onOnboard,
	onRequest,
	setState,
}: {
	inv: Landing;
	state: string;
	role: string;
	phase: Phase;
	name: string;
	setName: (v: string) => void;
	onJoinNew: () => void;
	onJoinSso: () => void;
	onSignedIn: () => void;
	onOnboard: () => void;
	onRequest: () => void;
	setState: (s: Landing["state"]) => void;
}) {
	const first = inv.inviter.name.split(" ")[0];
	const until = inv.at ? formatRelative(new Date(inv.at)) : "";

	if (phase === "requested") {
		return (
			<>
				<Mark tone="ok" />
				<Heading title={`${first} weet het`} sub={`We hebben ${inv.inviter.name} gevraagd ${state === "full" ? "een plek vrij te maken of bij te kopen" : "je een nieuwe uitnodiging te sturen"}. Die komt binnen op ${inv.email ?? "je e-mailadres"}.`} />
				<Link to="/login" className={SECONDARY}>
					Naar inloggen
				</Link>
			</>
		);
	}

	if (state === "expired" || state === "revoked" || state === "missing") {
		const title = state === "expired" ? "Deze uitnodiging is verlopen" : state === "revoked" ? "Deze uitnodiging is ingetrokken" : "Deze uitnodiging bestaat niet";
		const sub =
			state === "expired"
				? `De uitnodiging van ${inv.inviter.name} voor ${inv.workspace} verliep ${until}. Vraag een nieuwe en je krijgt hem op ${inv.email ?? "je e-mailadres"}.`
				: state === "revoked"
					? `${inv.inviter.name} heeft deze uitnodiging voor ${inv.workspace} ingetrokken. Denk je dat dat een vergissing is, vraag het dan even na.`
					: "Controleer of je de hele link hebt gekopieerd, of vraag wie je uitnodigde om hem opnieuw te sturen.";
		return (
			<>
				<Mark tone="off" />
				<Heading title={title} sub={sub} />
				{state === "missing" ? null : <Inviter inv={inv} />}
				<div className="flex flex-col gap-2.5">
					{state === "expired" ? (
						<button type="button" onClick={onRequest} className={PRIMARY}>
							Nieuwe uitnodiging vragen
						</button>
					) : state === "revoked" ? (
						<a href={`mailto:${inv.inviter.name.toLowerCase().split(" ")[0]}@northwindclothing.co?subject=${encodeURIComponent(`Uitnodiging voor ${inv.workspace}`)}`} className={PRIMARY}>
							<Mail className="size-4" strokeWidth={1.75} />
							{first} mailen
						</a>
					) : null}
					<Link to="/login" className={SECONDARY}>
						Naar inloggen
					</Link>
				</div>
			</>
		);
	}

	if (state === "accepted") {
		return (
			<>
				<Mark tone="ok" />
				<Heading title={`Je zit al in ${inv.workspace}`} sub={`${inv.email} accepteerde deze uitnodiging op ${inv.at ? formatDate(new Date(inv.at), { day: "numeric", month: "long", year: "numeric" }) : "een eerdere dag"}. De link doet verder niets meer.`} />
				<RoleCard inv={inv} role={role} />
				<div className="flex flex-col gap-2.5">
					<button
						type="button"
						onClick={() => {
							setPersonaSelection(inv.supplierId ? "supplier" : "admin");
							window.location.assign(appHref(inv.supplierId ? "/supplier/dashboard" : "/dashboard"));
						}}
						className={PRIMARY}
					>
						Naar {inv.supplierId ? "het portaal" : inv.workspace}
						<ArrowRight className="size-4" strokeWidth={2} />
					</button>
					<Link to="/login" className={SECONDARY}>
						Met een ander account inloggen
					</Link>
				</div>
			</>
		);
	}

	if (state === "full") return <FullState inv={inv} role={role} onRequest={onRequest} />;

	if (state === "other-account") {
		return (
			<>
				<Heading title={`Uitnodiging voor ${inv.workspace}`} sub={<InviterLine inv={inv} until={until} />} />
				<Inviter inv={inv} />
				<RoleCard inv={inv} role={role} />
				<div className="flex flex-col gap-3 rounded-xl bg-signal-amber-bg px-4 py-3">
					<p className="text-ink text-sm leading-normal">
						Je bent ingelogd als <span className="font-medium">{SIGNED_IN_AS.email}</span>. Deze uitnodiging is voor <span className="font-medium">{inv.email}</span>, en alleen dat account kan hem accepteren.
					</p>
				</div>
				<div className="flex flex-col gap-2.5">
					<button type="button" onClick={() => setState("existing")} className={PRIMARY}>
						Uitloggen en doorgaan als {inv.email}
					</button>
					<a href={`mailto:noor@kestrelgoods.co?subject=${encodeURIComponent("Uitnodiging naar mijn werkadres")}&body=${encodeURIComponent(`Kun je ${SIGNED_IN_AS.email} uitnodigen in plaats van ${inv.email}?`)}`} className={SECONDARY}>
						{first} vragen mijn werkadres uit te nodigen
					</a>
				</div>
			</>
		);
	}

	if (state === "existing") return <SignInState inv={inv} role={role} until={until} onSignedIn={onSignedIn} />;
	if (state === "sso") return <SsoState inv={inv} role={role} until={until} onContinue={onJoinSso} />;

	// new, link, supplier, affiliate: make the account here.
	return <AccountState inv={inv} state={state} role={role} until={until} name={name} setName={setName} onDone={state === "supplier" || state === "affiliate" ? onOnboard : onJoinNew} />;
}

function Mark({ tone }: { tone: "ok" | "off" }) {
	return (
		<span className={cn("flex size-10 items-center justify-center rounded-lg", tone === "ok" ? "bg-signal-green-bg text-signal-green" : "bg-mist text-ink-2")}>
			{tone === "ok" ? <Check className="size-4" strokeWidth={2.25} /> : <X className="size-4" strokeWidth={2} />}
		</span>
	);
}

function InviterLine({ inv, until }: { inv: Landing; until: string }) {
	return (
		<>
			{inv.inviter.name} ({inv.inviter.role}) nodigde {inv.email ? <span className="font-medium text-ink">{inv.email}</span> : "je"} uit
			{until ? `. De uitnodiging verloopt ${until}.` : "."}
		</>
	);
}

/** Who asked, and what they wrote. */
function Inviter({ inv }: { inv: Landing }) {
	if (!inv.message) return null;
	return (
		<figure className="flex gap-3 rounded-xl bg-mist px-4 py-3">
			<span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-2xs" style={personField(inv.inviter.id)}>
				{initials(inv.inviter.name)}
			</span>
			<div className="flex min-w-0 flex-col gap-0.5">
				<blockquote className="text-ink text-sm leading-normal">{inv.message}</blockquote>
				<figcaption className="text-ink-3 text-xs">{inv.inviter.name}</figcaption>
			</div>
		</figure>
	);
}

function personField(seed: string) {
	let h = 0;
	for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return { backgroundColor: PERSON_FIELDS[h % PERSON_FIELDS.length], color: "var(--person-ink)" };
}

/** The role the invitation grants and what it may do, in the roles matrix's own words. */
function RoleCard({ inv, role }: { inv: Landing; role: string }) {
	const abilities = useAbilities(inv.roleId ?? "");
	const stores = useStoreAccessLabel(inv.stores);
	if (inv.company) {
		return (
			<section className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3.5">
				<h3 className="font-medium text-base text-ink">Wat {inv.company} in het portaal ziet</h3>
				<ul className="flex flex-col gap-1.5">
					{PORTAL_SCOPES.filter((s) => inv.scopes?.includes(s.id)).map((s) => (
						<li key={s.id} className="flex gap-2 text-sm">
							<Check className="mt-0.5 size-3.5 shrink-0 text-signal-green" strokeWidth={2.25} />
							<span className="text-ink-2">
								<span className="text-ink">{s.label}.</span> {s.detail}
							</span>
						</li>
					))}
				</ul>
			</section>
		);
	}
	if (inv.tier) {
		return (
			<section className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3.5">
				<div className="flex items-baseline justify-between gap-3">
					<h3 className="font-medium text-base text-ink">Niveau {inv.tier.label}</h3>
					<span className="font-medium text-ink text-lg tabular-nums">{inv.tier.rate}%</span>
				</div>
				<ul className="flex flex-col gap-1.5 text-ink-2 text-sm">
					<li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-signal-green" strokeWidth={2.25} />Je eigen kortingscode{inv.code ? `, voorlopig ${inv.code}` : ""}, en links naar elk product.</li>
					<li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-signal-green" strokeWidth={2.25} />Commissie na een retourtermijn van 14 dagen, uitbetaald op de 15e.</li>
					<li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-signal-green" strokeWidth={2.25} />Je ziet alleen je eigen doorverwijzingen, niet de winkel.</li>
				</ul>
			</section>
		);
	}
	return (
		<section className="flex flex-col gap-2 rounded-xl bg-paper px-4 py-3.5">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="font-medium text-base text-ink">Als {role || "teamlid"}</h3>
				<span className="truncate text-ink-3 text-sm">{stores}</span>
			</div>
			{abilities.length > 0 ? (
				<ul className="grid gap-y-1.5 text-sm">
					{abilities.map((a) => (
						<li key={a} className="flex gap-2 text-ink-2">
							<Check className="mt-0.5 size-3.5 shrink-0 text-signal-green" strokeWidth={2.25} />
							{a}
						</li>
					))}
				</ul>
			) : (
				<p className="text-ink-2 text-sm">Wat deze rol kan, legt de werkruimte zelf vast.</p>
			)}
		</section>
	);
}

/* ── the forms ─────────────────────────────────────────────────────────────────────────────────── */

function PasswordField({ value, onChange, id, autoComplete }: { value: string; onChange: (v: string) => void; id: string; autoComplete: string }) {
	const [show, setShow] = useState(false);
	return (
		<div className="relative">
			<input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className={cn(INPUT, "pr-11")} placeholder="Minimaal 8 tekens" />
			<button
				type="button"
				aria-label={show ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
				onClick={() => setShow((s) => !s)}
				className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-mist hover:text-ink"
			>
				{show ? <EyeOff className="size-4" strokeWidth={1.75} /> : <Eye className="size-4" strokeWidth={1.75} />}
			</button>
		</div>
	);
}

function useBusy() {
	const [busy, setBusy] = useState(false);
	const run = (fn: () => void, ms = 650) => {
		if (busy) return;
		setBusy(true);
		window.setTimeout(() => {
			setBusy(false);
			fn();
		}, ms);
	};
	return { busy, run };
}

function AccountState({
	inv,
	state,
	role,
	until,
	name,
	setName,
	onDone,
}: {
	inv: Landing;
	state: string;
	role: string;
	until: string;
	name: string;
	setName: (v: string) => void;
	onDone: () => void;
}) {
	const [email, setEmail] = useState(inv.email ?? "");
	const [password, setPassword] = useState("");
	const [company, setCompany] = useState(inv.company ?? "");
	const [error, setError] = useState<string | null>(null);
	const { busy, run } = useBusy();
	const link = state === "link";
	const supplier = state === "supplier";

	const title = supplier ? `${inv.company ?? "Je bedrijf"} in het leveranciersportaal` : state === "affiliate" ? `Partner worden van ${inv.workspace}` : `Word lid van ${inv.workspace}`;
	const sub = link ? (
		<>
			{inv.inviter.name} deelde deze link. Je komt binnen als <span className="font-medium text-ink">{role}</span>
			{until ? `; hij werkt tot ${until.replace(/^over /, "over ")}.` : "."}
		</>
	) : (
		<InviterLine inv={inv} until={until} />
	);

	function submit() {
		if (!name.trim()) return setError(supplier ? "Vul je naam in, zo weet Northwind met wie ze praten." : "Vul je naam in.");
		if (link && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim())) return setError("Vul een geldig e-mailadres in.");
		if (password.length < 8) return setError("Kies een wachtwoord van minimaal 8 tekens.");
		setError(null);
		run(onDone);
	}

	return (
		<>
			<Heading title={title} sub={sub} />
			<Inviter inv={inv} />
			<RoleCard inv={inv} role={role} />

			<GoogleButton
				label="Doorgaan met Google"
				onClick={() => {
					if (!name.trim()) setName(inv.name ?? nameOf(email));
					run(onDone, 900);
				}}
			/>
			<OAuthDivider label="of met een wachtwoord" />

			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="inv-email">{supplier ? "Zakelijk e-mailadres" : "E-mailadres"}</Label>
					<input id="inv-email" type="email" value={email} readOnly={!link} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={INPUT} placeholder="naam@bedrijf.nl" />
				</div>
				{supplier ? (
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="inv-company">Bedrijfsnaam</Label>
						<input id="inv-company" value={company} onChange={(e) => setCompany(e.target.value)} className={INPUT} />
					</div>
				) : null}
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="inv-name">{supplier ? "Je naam" : "Volledige naam"}</Label>
					<input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus className={INPUT} placeholder="Voornaam Achternaam" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="inv-password">Wachtwoord</Label>
					<PasswordField id="inv-password" value={password} onChange={setPassword} autoComplete="new-password" />
				</div>
				<FormError message={error ?? undefined} />
				<button type="submit" disabled={busy} className={cn(PRIMARY, "mt-1")}>
					{busy ? <Loader className="size-4 animate-spin" strokeWidth={2} /> : null}
					{busy ? "Account maken" : supplier || state === "affiliate" ? "Account maken en verder" : `Account maken en deelnemen`}
				</button>
			</form>
			<p className="text-center text-ink-3 text-sm">
				Heb je al een account?{" "}
				<Link to="/login" search={{ redirect: `/invitations/${inv.id}` }} className="font-medium text-arc-ink hover:text-ink">
					Inloggen
				</Link>
			</p>
		</>
	);
}

const nameOf = (email: string) =>
	(email.split("@")[0] ?? "")
		.split(/[._-]+/)
		.filter(Boolean)
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join(" ");

function SignInState({ inv, role, until, onSignedIn }: { inv: Landing; role: string; until: string; onSignedIn: () => void }) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const { busy, run } = useBusy();
	return (
		<>
			<Heading title={`Inloggen om ${inv.workspace} te openen`} sub={<InviterLine inv={inv} until={until} />} />
			<Inviter inv={inv} />
			<RoleCard inv={inv} role={role} />
			<GoogleButton onClick={() => run(onSignedIn, 900)} />
			<OAuthDivider label="of met je wachtwoord" />
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					if (password.length < 8) return setError("Minimaal 8 tekens.");
					setError(null);
					run(onSignedIn);
				}}
			>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="inv-email">E-mailadres</Label>
					<input id="inv-email" readOnly value={inv.email ?? ""} className={INPUT} />
				</div>
				<div className="flex flex-col gap-1.5">
					<div className="flex items-baseline justify-between">
						<Label htmlFor="inv-password">Wachtwoord</Label>
						<button type="button" onClick={() => toast.success(`Resetlink verstuurd naar ${inv.email}`, { description: "De link is 30 minuten geldig." })} className="font-medium text-arc-ink text-xs leading-none hover:text-ink">
							Vergeten?
						</button>
					</div>
					<PasswordField id="inv-password" value={password} onChange={setPassword} autoComplete="current-password" />
				</div>
				<FormError message={error ?? undefined} />
				<button type="submit" disabled={busy} className={cn(PRIMARY, "mt-1")}>
					{busy ? <Loader className="size-4 animate-spin" strokeWidth={2} /> : null}
					{busy ? "Inloggen" : "Inloggen en accepteren"}
				</button>
			</form>
		</>
	);
}

function SsoState({ inv, role, until, onContinue }: { inv: Landing; role: string; until: string; onContinue: () => void }) {
	const { busy, run } = useBusy();
	const domain = inv.email?.split("@")[1] ?? "je bedrijf";
	return (
		<>
			<Heading title={`Word lid van ${inv.workspace}`} sub={<InviterLine inv={inv} until={until} />} />
			<RoleCard inv={inv} role={role} />
			<div className="flex gap-3 rounded-xl bg-paper px-4 py-3">
				<ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-2" strokeWidth={1.75} />
				<p className="text-ink-2 text-sm leading-normal">
					{inv.workspace} laat alleen inloggen toe via Google Workspace van <span className="font-medium text-ink">{domain}</span>. Een wachtwoord voor Insyte maak je dus niet aan.
				</p>
			</div>
			{busy ? (
				<button type="button" disabled className={PRIMARY}>
					<Loader className="size-4 animate-spin" strokeWidth={2} />
					Doorsturen naar Google
				</button>
			) : (
				<GoogleButton label="Doorgaan met Google Workspace" onClick={() => run(onContinue, 1000)} />
			)}
			<p className="text-center text-ink-3 text-sm">Je logt in als {inv.email}. Een ander account van Google werkt hier niet.</p>
		</>
	);
}

function FullState({ inv, role, onRequest }: { inv: Landing; role: string; onRequest: () => void }) {
	const seats = useSeats();
	const total = Math.max(seats.total, 12);
	return (
		<>
			<Heading title={`${inv.workspace} is vol`} sub={`Je uitnodiging is geldig, maar alle ${total} plekken op het abonnement zijn bezet. ${inv.inviter.name} kan er een bijkopen of iemand anders zijn plek laten vrijgeven.`} />
			<RoleCard inv={inv} role={role} />
			<div className="flex gap-0.5" aria-label={`${total} van ${total} plekken bezet`}>
				{Array.from({ length: total }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: seats are positions
					<span key={i} className="h-1.5 flex-1 rounded-full bg-signal-amber" />
				))}
			</div>
			<div className="flex flex-col gap-2.5">
				<button type="button" onClick={onRequest} className={PRIMARY}>
					{inv.inviter.name.split(" ")[0]} om een plek vragen
				</button>
				<Link to="/login" className={SECONDARY}>
					Met een ander account inloggen
				</Link>
			</div>
		</>
	);
}

/* ── joining: a face, and what you hear ────────────────────────────────────────────────────────── */

function PhotoStep({
	name,
	photo,
	setPhoto,
	field,
	setField,
	onNext,
	onBack,
}: {
	name: string;
	photo?: string;
	setPhoto: (v?: string) => void;
	field: number;
	setField: (i: number) => void;
	onNext: () => void;
	onBack: () => void;
}) {
	const picker = useRef<HTMLInputElement>(null);
	return (
		<>
			<Heading title="Hoe je team je herkent" sub="Je foto of je initialen staan bij alles wat je doet: tickets, reacties, wie wat heeft uitgevoerd." />
			<div className="flex items-center gap-4 rounded-xl bg-paper p-4">
				{photo ? (
					<img src={photo} alt="Je profielfoto" className="size-16 shrink-0 rounded-full object-cover" />
				) : (
					<span className="flex size-16 shrink-0 items-center justify-center rounded-full font-medium text-xl" style={{ backgroundColor: PERSON_FIELDS[field], color: "var(--person-ink)" }}>
						{initials(name || "?")}
					</span>
				)}
				<div className="flex min-w-0 flex-col gap-2">
					<span className="truncate font-medium text-base text-ink">{name || "Je naam"}</span>
					<div className="flex flex-wrap gap-1.5">
						<button type="button" onClick={() => picker.current?.click()} className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover">
							<Image className="size-3.5" strokeWidth={1.75} />
							{photo ? "Andere foto" : "Foto uploaden"}
						</button>
						{photo ? (
							<button type="button" onClick={() => setPhoto(undefined)} className="flex h-8 items-center rounded-md px-2.5 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink">
								Initialen gebruiken
							</button>
						) : null}
					</div>
					<input
						ref={picker}
						type="file"
						accept="image/*"
						className="sr-only"
						tabIndex={-1}
						aria-hidden
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) setPhoto(URL.createObjectURL(f));
							e.target.value = "";
						}}
					/>
				</div>
			</div>
			{photo ? null : (
				<div className="flex flex-col gap-2">
					<Label>Kleur van je initialen</Label>
					<div role="radiogroup" aria-label="Kleur" className="flex gap-2">
						{PERSON_FIELDS.map((f, i) => (
							<button
								key={f}
								type="button"
								role="radio"
								aria-checked={i === field}
								aria-label={`Kleur ${i + 1}`}
								onClick={() => setField(i)}
								className={cn("size-8 rounded-full transition-transform hover:scale-105", i === field && "ring-2 ring-arc ring-offset-2 ring-offset-background")}
								style={{ backgroundColor: f }}
							/>
						))}
					</div>
				</div>
			)}
			<StepFoot onBack={onBack} onNext={onNext} label="Verder" skip={onNext} />
		</>
	);
}

const NOTIFY = [
	{ id: "assigned", label: "Aan mij toegewezen", detail: "Een ticket, bestelling of chargeback die van jou is", on: true },
	{ id: "mentions", label: "Vermeldingen", detail: "Iemand noemt je in een chat of reactie", on: true },
	{ id: "deadlines", label: "Deadlines die naderen", detail: "Bewijs voor een chargeback, een te late leverancier", on: true },
	{ id: "digest", label: "Samenvatting om 8:00", detail: "Wat er gisteren gebeurde en wat vandaag wacht", on: false },
] as const;

function NotifyStep({ workspace, onDone, onBack }: { workspace: string; onDone: (n: { on: number; email: boolean }) => void; onBack: () => void }) {
	const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(NOTIFY.map((n) => [n.id, n.on])));
	const [email, setEmail] = useState<"app" | "email">("app");
	const { busy, run } = useBusy();
	const count = Object.values(on).filter(Boolean).length;
	return (
		<>
			<Heading title="Wat je wilt horen" sub="Insyte meldt alleen wat jou aangaat. Je past dit later aan in je profiel." />
			<ul className="flex flex-col overflow-hidden rounded-xl bg-paper [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
				{NOTIFY.map((n) => (
					<li key={n.id}>
						<label className="flex cursor-pointer items-center gap-3 px-4 py-3">
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="font-medium text-base text-ink">{n.label}</span>
								<span className="text-ink-3 text-sm">{n.detail}</span>
							</span>
							<Switch checked={on[n.id]} onCheckedChange={(v) => setOn((s) => ({ ...s, [n.id]: v }))} aria-label={n.label} />
						</label>
					</li>
				))}
			</ul>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Label>Waar</Label>
				<Segmented
					label="Waar"
					value={email}
					onChange={setEmail}
					options={[
						{ id: "app", label: "In Insyte" },
						{ id: "email", label: "In Insyte en per e-mail" },
					]}
				/>
			</div>
			<StepFoot onBack={onBack} onNext={() => run(() => onDone({ on: count, email: email === "email" }), 700)} label={busy ? "Werkruimte openen" : `Naar ${workspace}`} busy={busy} />
		</>
	);
}

function StepFoot({ onBack, onNext, label, skip, busy }: { onBack: () => void; onNext: () => void; label: string; skip?: () => void; busy?: boolean }) {
	return (
		<footer className="mt-2 flex items-center justify-between gap-3">
			<button type="button" onClick={onBack} disabled={busy} className="-ml-2 flex h-11 items-center rounded-lg px-2 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink disabled:opacity-0">
				Terug
			</button>
			<div className="flex items-center gap-1">
				{skip ? (
					<button type="button" onClick={skip} className="flex h-11 items-center rounded-lg px-3 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink">
						Overslaan
					</button>
				) : null}
				<button type="button" onClick={onNext} disabled={busy} className="group/cta flex h-11 items-center gap-2 rounded-lg bg-abyss px-4 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed">
					{busy ? <Loader className="size-4 animate-spin" strokeWidth={2} /> : null}
					{label}
					{busy ? null : <ArrowRight className="size-4 transition-transform group-hover/cta:translate-x-0.5" strokeWidth={2} />}
				</button>
			</div>
		</footer>
	);
}
