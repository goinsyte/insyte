/*
 * The knowledge base (PLAN 28, ADR-0027 `knowledge_articles`): chapters the customer agent and Vraag
 * Insyte answer from, each with versions and one published version the agents read. Drafts are
 * never used. Questions the agent handed over because nothing covered them are the gaps.
 *
 * Pure: the status words, the limit, publishing, reverting and the line diff, tested on their own.
 */

export const LIMIT = 40_000;

export type Audience = "customer_agent" | "assistant" | "both";

export const AUDIENCE_LABEL: Record<Audience, string> = { customer_agent: "Klantagent", assistant: "Vraag Insyte", both: "Beide" };

export type ArticleVersion = { n: number; at: string; by: string; body: string; title: string; published: boolean };

export type Article = {
	id: string;
	title: string;
	audience: Audience;
	/** The working text, which may be ahead of the published version. */
	body: string;
	versions: ArticleVersion[];
	editedAt: string;
	editedBy: string;
	/** Answers that cited it in the last seven days. */
	uses7d: number;
};

export type Gap = { id: string; question: string; at: string; customer: string; threadId?: string | undefined; channel: "webchat" | "email" | "whatsapp"; state: "open" | "answered" | "dismissed"; articleId?: string | undefined };

export type KnowledgeSeed = { articles: Article[]; gaps: Gap[] };

export type ArticleStatus = "published" | "draft" | "changed";

export const STATUS_LABEL: Record<ArticleStatus, string> = { published: "Gepubliceerd", draft: "Concept", changed: "Wijzigingen niet gepubliceerd" };

export const publishedVersion = (a: Pick<Article, "versions">) => [...a.versions].reverse().find((v) => v.published);

export function statusOf(a: Pick<Article, "versions" | "body" | "title">): ArticleStatus {
	const pub = publishedVersion(a);
	if (!pub) return "draft";
	return pub.body === a.body && pub.title === a.title ? "published" : "changed";
}

export const overLimit = (body: string) => body.length > LIMIT;

/** Keeps the working text as a new version; publishing makes it the one the agents read. */
export function saveVersion(a: Article, by: string, at: string, publish: boolean): Article {
	if (overLimit(a.body)) throw new Error(`An article may hold at most ${LIMIT} characters`);
	const n = (a.versions.at(-1)?.n ?? 0) + 1;
	return { ...a, editedAt: at, editedBy: by, versions: [...a.versions, { n, at, by, body: a.body, title: a.title, published: publish }] };
}

/** Puts an earlier version back as the working text and publishes it as a new version. */
export function revertTo(a: Article, n: number, by: string, at: string): Article {
	const v = a.versions.find((x) => x.n === n);
	if (!v) throw new Error(`No version ${n}`);
	return saveVersion({ ...a, body: v.body, title: v.title }, by, at, true);
}

export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** A line diff (longest common subsequence), enough to show what changed between two versions. */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.split("\n");
	const b = after.split("\n");
	const m = a.length;
	const n = b.length;
	const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
	for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < m && j < n) {
		if (a[i] === b[j]) {
			out.push({ kind: "same", text: a[i]! });
			i++;
			j++;
		} else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ kind: "removed", text: a[i++]! });
		else out.push({ kind: "added", text: b[j++]! });
	}
	while (i < m) out.push({ kind: "removed", text: a[i++]! });
	while (j < n) out.push({ kind: "added", text: b[j++]! });
	return out;
}

/** The chapters a new workspace starts from, one click each to a draft. */
export const SUGGESTED: ReadonlyArray<{ title: string; audience: Audience; body: string }> = [
	{ title: "Verzending en levertijden", audience: "both", body: "## Levertijden\n\n- Nederland: 1–2 werkdagen\n- België en Duitsland: 2–4 werkdagen\n\n## Verzendkosten\n\nGratis vanaf €75. Daaronder €4,95.\n" },
	{ title: "Retourneren", audience: "both", body: "## Termijn\n\nJe kunt binnen 30 dagen na bezorging retourneren via ons retourportaal.\n\n## Hoe\n\n1. Ga naar het retourportaal\n2. Vul je bestelnummer en e-mailadres in\n3. Kies wat je terugstuurt en waarom\n" },
	{ title: "Maten", audience: "customer_agent", body: "## Hoe valt het?\n\nOnze jassen vallen normaal. Twijfel je tussen twee maten, neem dan de grotere.\n" },
	{ title: "Betalen", audience: "customer_agent", body: "## Betaalmethoden\n\niDEAL, creditcard, Klarna (achteraf betalen) en PayPal.\n" },
	{ title: "Over het merk", audience: "both", body: "## Wie we zijn\n\nNorthwind maakt jassen en basics die lang meegaan.\n" },
];
