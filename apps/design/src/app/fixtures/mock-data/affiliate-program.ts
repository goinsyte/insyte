import { AFF_TODAY, affiliateStatements, CONVERSIONS, TIERS } from "../affiliate-data";
import { affiliates } from "./affiliates";
import { byScenario, longEmail, longName } from "../scenario";
import type { Tier, Application, ProgramAffiliate, PayoutLine, AffiliateInvite } from "@insyte/ui/data-source";
export type { Tier, Application, ProgramAffiliate, PayoutLine, AffiliateInvite };

/**
 * The partner programme as the brand runs it: who applied, who is in and on what tier, and this
 * month's commission waiting to be approved. Priya's figures are her own conversions
 * (`lib/affiliate-data.ts`), the same rows her side of the product shows; the others carry totals of
 * the same shape. The programme's clock is the affiliate side's (`AFF_TODAY`), so a month that is
 * open here is open there.
 */






const DAY = 86_400_000;
const round = (n: number) => Math.round(n * 100) / 100;

export const tierOf = (id: Tier) => TIERS.find((t) => t.id === id) ?? TIERS[0];

/** The month whose commission is waiting: the newest statement, paid on the 15th after it. */
const statements = affiliateStatements();
const open = statements.find((s) => s.status === "open") ?? statements[0];
export const PAYOUT_MONTH = { label: open?.label ?? "Deze maand", payDay: open?.payDay ?? AFF_TODAY + 20 * DAY };

const priyaOwn = CONVERSIONS.filter((c) => c.status !== "reversed");
const priya = affiliates.find((a) => a.id === "aff_priya");
const jordan = affiliates.find((a) => a.id === "aff_jordan");

const SETTLED_AFFILIATES: ProgramAffiliate[] = [
	...(priya
		? [{ id: priya.id, name: priya.name, email: priya.email, code: priya.referral_code, tier: priya.tier, rate: priya.commission_rate, joinedAt: Date.parse(priya.approved_at ?? priya.created_at), conversions: priyaOwn.length, earned: round(priyaOwn.reduce((n, c) => n + c.commission, 0)) }]
		: []),
	...(jordan
		? [{ id: jordan.id, name: jordan.name, email: jordan.email, code: jordan.referral_code, tier: jordan.tier, rate: jordan.commission_rate, joinedAt: Date.parse(jordan.approved_at ?? jordan.created_at), conversions: 61, earned: 1148.4 }]
		: []),
	{ id: "aff_daan", name: "Daan Mulder", email: "daan@buitenmetdaan.nl", code: "DAAN", tier: "bronze", rate: 10, joinedAt: Date.parse("2026-03-02T10:00:00Z"), conversions: 9, earned: 96.3, paused: false },
];

function busyAffiliates(): ProgramAffiliate[] {
	return [
		...SETTLED_AFFILIATES,
		...Array.from({ length: 14 }, (_, i): ProgramAffiliate => {
			const tier = (["bronze", "silver", "gold"] as const)[i % 3]!;
			return {
				id: `aff_busy_${i}`,
				name: longName(i + 60),
				email: longEmail(i + 60),
				code: longName(i + 60).split(" ")[0]!.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10),
				tier,
				rate: tierOf(tier).rate,
				joinedAt: AFF_TODAY - (30 + i * 11) * DAY,
				conversions: 4 + i * 7,
				earned: round(38.5 + i * 91.25),
			};
		}),
	];
}

export const seedProgramAffiliates = () => byScenario({ empty: [], settled: SETTLED_AFFILIATES, busy: busyAffiliates });

const fromSeed = affiliates.filter((a) => a.status !== "approved").map(
	(a): Application => ({
		id: a.id,
		name: a.name,
		email: a.email,
		channel: a.id === "aff_amara" ? "Instagram" : "YouTube",
		audience: a.id === "aff_amara" ? "18.400 volgers, vooral NL en BE" : "62.000 abonnees, Japan en VS",
		motivation:
			a.id === "aff_amara"
				? "Ik draag de Aurora Hooded Fleece al een winter en krijg er wekelijks vragen over. Ik wil een code die mijn volgers echt gebruiken."
				: "Ik maak stijlvideo's over streetwear en wil Northwind meenemen in mijn najaarsserie.",
		appliedAt: Date.parse(a.created_at),
		status: a.status === "rejected" ? "rejected" : "pending",
		reason: a.rejection_reason,
		decidedAt: a.status === "rejected" ? Date.parse(a.created_at) + 2 * DAY : undefined,
	}),
);

const SETTLED_APPLICATIONS: Application[] = [
	...fromSeed,
	{
		id: "app_sem",
		name: "Sem de Wit",
		email: "sem@semdewit.nl",
		channel: "TikTok",
		audience: "41.000 volgers, 18 tot 24 jaar",
		motivation: "Korte video's over basics die lang meegaan. Jullie jassen passen precies in mijn serie over de winterkast.",
		appliedAt: AFF_TODAY - 2 * DAY,
		status: "pending",
	},
	{
		id: "app_yara",
		name: "Yara El Amrani",
		email: "yara@slowwardrobe.blog",
		channel: "Blog en nieuwsbrief",
		audience: "9.200 abonnees op de nieuwsbrief",
		motivation: "Ik schrijf over duurzame garderobes en vergelijk merken op materiaal. Ik wil Northwind opnemen in mijn gids voor het najaar.",
		appliedAt: AFF_TODAY - 4 * DAY,
		status: "pending",
	},
];

function busyApplications(): Application[] {
	return [
		...SETTLED_APPLICATIONS,
		...Array.from({ length: 12 }, (_, i): Application => ({
			id: `app_busy_${i}`,
			name: longName(i + 80),
			email: longEmail(i + 80),
			channel: ["Instagram", "TikTok", "YouTube", "Pinterest"][i % 4]!,
			audience: `${(3 + i * 4).toLocaleString("nl-NL")}.000 volgers`,
			motivation: "Ik wil Northwind graag aanbevelen aan mijn publiek, dat veel vraagt naar warme jassen die er ook goed uitzien in de stad.",
			appliedAt: AFF_TODAY - (i + 1) * 0.6 * DAY,
			status: "pending",
		})),
	];
}

export const seedApplications = () => byScenario({ empty: [], settled: SETTLED_APPLICATIONS, busy: busyApplications });

function payoutFor(a: ProgramAffiliate, i: number): PayoutLine {
	if (a.id === "aff_priya" && open) {
		const rows = open.rows;
		const sum = (s: string) => round(rows.filter((c) => c.status === s).reduce((n, c) => n + c.commission, 0));
		return { affiliateId: a.id, name: a.name, method: "PayPal", orders: rows.length, approvable: round(sum("approved") + sum("paid")), inWindow: sum("pending"), reversed: sum("reversed") };
	}
	const base = a.earned / Math.max(4, a.conversions / 6);
	return {
		affiliateId: a.id,
		name: a.name,
		method: ["Bankoverschrijving", "Wise", "PayPal"][i % 3]!,
		orders: Math.max(1, Math.round(a.conversions / 6)),
		approvable: round(base * 0.7),
		inWindow: round(base * 0.3),
		reversed: i % 4 === 1 ? round(base * 0.05) : 0,
	};
}

export const seedPayouts = () => seedProgramAffiliates().map(payoutFor);

export const seedAffiliateInvites = (): AffiliateInvite[] =>
	byScenario({
		empty: [],
		settled: [{ id: "inv_affiliate", name: "Femke Jansen", email: "femke@kijkfemke.nl", tier: "silver", message: "Je reviews van onze fleece deden het goed. We starten je op Zilver.", sentAt: Date.now() - DAY, expiresAt: Date.now() + 13 * DAY }],
	});

/** Reasons the brand gives most, so a rejection is a click and still says something. */
export const REJECT_REASONS = [
	"Je publiek past nog niet bij onze doelgroep.",
	"Je publiek overlapt met dat van een affiliate in dezelfde regio.",
	"We zien nog te weinig bereik. Probeer het over 6 maanden opnieuw.",
	"We missen informatie over je kanaal. Vul je aanmelding aan.",
] as const;
