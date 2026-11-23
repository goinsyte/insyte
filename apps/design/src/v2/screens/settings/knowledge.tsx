import { Fragment, useState } from "react"
import type { ReactNode } from "react"
import { ASSISTANT } from "../../assistant.ts"
import {
  articlesFor,
  AUDIENCE_LABEL,
  gapsFor,
  KNOWLEDGE_LIMIT,
  latest,
  publishedVersion,
  relative
} from "../../fixtures/settings.ts"
import type { Article, Audience, Gap, Version } from "../../fixtures/settings.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog, Sheet } from "../../ui/dialog.tsx"
import { ArrowLeft, BookOpen, History, List as ListGlyph, Plus, Sparkles, X } from "../../ui/icons.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { PageSection } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { useView } from "../../view.ts"
import { figure, SettingsPage, useSaved } from "./parts.tsx"

const NOW = new Date(2026, 10, 23, 14, 30)
const AUDIENCES = (Object.keys(AUDIENCE_LABEL) as ReadonlyArray<Audience>).map((a) => ({
  value: a,
  label: AUDIENCE_LABEL[a]
}))

/** The knowledge as this session left it: the store the list and the editor share. */
function useArticles() {
  const view = useView()
  return useSaved<ReadonlyArray<Article>>("knowledge", articlesFor(view.staat))
}

const statusOf = (a: Article) => {
  const last = latest(a)
  if (publishedVersion(a) === undefined) return { tone: "neutral" as const, word: "Concept" }
  if (last !== undefined && !last.published) return { tone: "warn" as const, word: "Concept klaar" }
  return { tone: "good" as const, word: "Gepubliceerd" }
}

/**
 * Kennisbank: the chapters the customer agent and Ask Magnus answer from, and the questions customers
 * asked that nothing in it answered. A gap goes into a chapter; a chapter opens in the editor. The
 * current demo's `settings/ai/knowledge`.
 */
export function KnowledgeScreen() {
  const view = useView()
  const { edit } = useAccess("settings")
  const [articles, setArticles] = useArticles()
  const [gaps, setGaps] = useSaved<ReadonlyArray<Gap>>("knowledge.gaps", gapsFor(view.staat))
  const [writing, setWriting] = useState(false)
  const [placing, setPlacing] = useState<Gap | null>(null)
  const published = articles.filter((a) => publishedVersion(a) !== undefined).length
  const dismiss = (g: Gap) => {
    setGaps((all) => all.filter((x) => x.id !== g.id))
    toast({
      title: "Vraag weggehaald",
      action: { label: "Ongedaan maken", onClick: () => setGaps((all) => [g, ...all]) }
    })
  }

  return (
    <SettingsPage
      title="Kennisbank"
      width="record"
      area="settings"
      what="de kennisbank"
      meta={`${articles.length} hoofdstukken · ${published} gepubliceerd · de klantagent en ${AUDIENCE_LABEL.assistant} antwoorden hieruit`}
      actions={edit
        ? (
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setWriting(true)}>
            Hoofdstuk schrijven
          </Button>
        )
        : undefined}
    >
      {gaps.length > 0 && (
        <PageSection id="gaten" title="Nog niet beantwoord" meta={String(gaps.length)}>
          <List divided label="Nog niet beantwoord">
            {gaps.map((g) => (
              <ListRow
                key={g.id}
                padded={false}
                title={g.question}
                meta={
                  <>
                    {g.customerId === undefined
                      ? g.customer
                      : <Link to={paths.customer(g.customerId)} className="hover:underline">{g.customer}</Link>} ·{" "}
                    {g.channel} · {relative(g.at)}
                  </>
                }
                trail={edit
                  ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setPlacing(g)}
                      >
                        Toevoegen aan…
                      </Button>
                      <button
                        type="button"
                        aria-label={`“${g.question}” weghalen`}
                        title="Weghalen"
                        onClick={() => dismiss(g)}
                        className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
                      >
                        <X size={15} />
                      </button>
                    </>
                  )
                  : undefined}
              />
            ))}
          </List>
        </PageSection>
      )}

      <PageSection id="hoofdstukken" title="Hoofdstukken" meta={String(articles.length)}>
        {articles.length === 0
          ? (
            <EmptyState
              glyph={BookOpen}
              title="Nog geen kennisbank"
              action={edit
                ? <Button icon={<Plus />} onClick={() => setWriting(true)}>Hoofdstuk schrijven</Button>
                : undefined}
            >
              Schrijf op wat je klanten vaak vragen: levertijden, retourneren, maten. De klantagent antwoordt hieruit en
              zegt uit welk hoofdstuk.
            </EmptyState>
          )
          : (
            <Table label="Hoofdstukken" minWidth={640}>
              <THead>
                <Th>Hoofdstuk</Th>
                <Th>Voor</Th>
                <Th align="right">Gebruikt, 7 dagen</Th>
                <Th>Laatst gewijzigd</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {articles.map((a) => {
                  const last = latest(a)
                  const s = statusOf(a)
                  return (
                    <Tr key={a.id} onOpen={() => navigate(paths.settings(`ai/kennisbank/${a.id}`))}>
                      <Td header>
                        <Link to={paths.settings(`ai/kennisbank/${a.id}`)} className="hover:underline">{a.title}</Link>
                      </Td>
                      <Td muted>{AUDIENCE_LABEL[a.audience]}</Td>
                      <Td figure>{a.uses7d}</Td>
                      <Td muted>
                        {last === undefined ? "—" : `${last.by.split(" ")[0] ?? ""} · ${relative(last.at)}`}
                      </Td>
                      <Td>
                        <Status tone={s.tone}>{s.word}</Status>
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          )}
      </PageSection>

      <NewArticleDialog
        open={writing}
        onClose={() => setWriting(false)}
        onCreate={(title, audience) => {
          const id = `kb_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}`
          setArticles((
            all
          ) => [...all, {
            id,
            title,
            audience,
            uses7d: 0,
            versions: [{ n: 1, at: NOW, by: "Elena Hart", body: "", published: false }]
          }])
          setWriting(false)
          navigate(paths.settings(`ai/kennisbank/${id}`))
        }}
      />
      <Dialog
        open={placing !== null}
        onClose={() => setPlacing(null)}
        title="In welk hoofdstuk hoort het antwoord?"
        description={placing === null ? undefined : `“${placing.question}”`}
        size="sm"
      >
        <List divided label="Hoofdstukken">
          {articles.map((a) => (
            <ListRow
              key={a.id}
              padded={false}
              onClick={() => {
                const g = placing
                if (g === null) return
                setGaps((all) => all.filter((x) => x.id !== g.id))
                setPlacing(null)
                navigate(`${paths.settings(`ai/kennisbank/${a.id}`)}?vraag=${encodeURIComponent(g.question)}`)
              }}
              title={a.title}
              meta={AUDIENCE_LABEL[a.audience]}
              trail={<span className="text-ink-3">Hoofdstuk openen</span>}
            />
          ))}
        </List>
      </Dialog>
    </SettingsPage>
  )
}

function NewArticleDialog({ open, onClose, onCreate }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly onCreate: (title: string, audience: Audience) => void
}) {
  const [title, setTitle] = useState("")
  const [audience, setAudience] = useState<Audience>("both")
  const [tried, setTried] = useState(false)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Hoofdstuk schrijven"
      description="Je begint met een concept. De agents gebruiken het pas als je het publiceert."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true)
              if (title.trim() === "") return
              onCreate(title.trim(), audience)
              setTitle("")
              setTried(false)
            }}
          >
            Concept maken
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Titel" error={tried && title.trim() === "" ? "Geef het hoofdstuk een titel" : undefined}>
          {(c) => (
            <Input
              {...c}
              placeholder="Verzending buiten de EU"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <Field label="Voor" hint="Wie eruit antwoordt.">
          {(c) => (
            <Select {...c} value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
              {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  )
}

/* ── the editor ────────────────────────────────────────────────────────────────────────────────── */

const DRAFT_FROM_MAGNUS = `## Kort antwoord

Wat de klant moet weten, in één of twee zinnen.

## Hoe het werkt

- De eerste stap
- Wat de klant daarna krijgt

## Uitzonderingen

Wanneer het anders gaat, en wie de klant dan helpt.`

/** Plain markdown for the preview: headings, lists, paragraphs. */
function Preview({ body }: { readonly body: string }) {
  const blocks = body.split(/\n{2,}/)
  return (
    <div className="flex flex-col gap-3 text-sm text-ink">
      {blocks.map((b, i) => {
        if (b.startsWith("## ")) return <h3 key={i} className="pt-2 text-md font-semibold">{b.slice(3)}</h3>
        const lines = b.split("\n")
        if (lines.every((l) => l.startsWith("- "))) {
          return <ul key={i} className="list-disc pl-5">{lines.map((l) => <li key={l}>{l.slice(2)}</li>)}</ul>
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            <ol key={i} className="list-decimal pl-5">
              {lines.map((l) => <li key={l}>{l.replace(/^\d+\. /, "")}</li>)}
            </ol>
          )
        }
        return <p key={i} className="text-pretty">{b}</p>
      })}
    </div>
  )
}

/** A line diff between two versions: what was added and what went. */
function diffLines(before: string, after: string): ReadonlyArray<{ kind: "same" | "add" | "del"; text: string }> {
  const a = before.split("\n")
  const b = after.split("\n")
  const out: Array<{ kind: "same" | "add" | "del"; text: string }> = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] ?? "" })
      i += 1
      j += 1
    } else if (j < b.length && !a.slice(i).includes(b[j] ?? "")) {
      out.push({ kind: "add", text: b[j] ?? "" })
      j += 1
    } else if (i < a.length) {
      out.push({ kind: "del", text: a[i] ?? "" })
      i += 1
    } else {
      j += 1
    }
  }
  return out
}

const dateOf = (v: Version) => v.at.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })

/**
 * One chapter: its title, who answers from it, the text, and its versions. Saving keeps a draft;
 * publishing makes it what the agents read. The versions sheet shows what changed and can put an
 * older text back. `?vraag=` brings the customer's question that led here.
 */
export function ArticleScreen({ id }: { readonly id: string }) {
  const { edit } = useAccess("settings")
  const [articles, setArticles] = useArticles()
  const question = useQuery("vraag")
  const versionsOpen = useQuery("versies") !== null
  const article = articles.find((a) => a.id === id)
  const last = article === undefined ? undefined : latest(article)
  const [title, setTitle] = useState(article?.title ?? "")
  const [audience, setAudience] = useState<Audience>(article?.audience ?? "both")
  const [body, setBody] = useState(last?.body ?? "")
  const [preview, setPreview] = useState(false)
  const [writing, setWriting] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)

  if (article === undefined || last === undefined) {
    return (
      <SettingsPage title="Kennisbank" area="settings">
        <EmptyState
          glyph={BookOpen}
          title="Dit hoofdstuk bestaat niet (meer)."
          action={<ButtonLink to={paths.settings("ai/kennisbank")}>Ga terug naar de kennisbank</ButtonLink>}
        >
          Misschien is het verwijderd of hernoemd.
        </EmptyState>
      </SettingsPage>
    )
  }

  const dirty = title !== article.title || audience !== article.audience || body !== last.body
  const s = statusOf(article)
  const tooLong = body.length > KNOWLEDGE_LIMIT
  const store = (published: boolean) => {
    if (title.trim() === "") {
      toast({ title: "Geef het hoofdstuk een titel", tone: "bad" })
      return
    }
    if (tooLong) {
      toast({ title: `Een hoofdstuk mag tot ${figure(KNOWLEDGE_LIMIT)} tekens zijn`, tone: "bad" })
      return
    }
    const version: Version = { n: last.n + 1, at: NOW, by: "Elena Hart", body, published }
    const sameText = body === last.body
    setArticles((all) =>
      all.map((a) =>
        a.id === id
          ? {
            ...a,
            title: title.trim(),
            audience,
            versions: sameText
              ? a.versions.map((
                v,
                i
              ) => (i === a.versions.length - 1 ? { ...v, published: v.published || published } : v))
              : [...a.versions, version]
          }
          : a
      )
    )
    toast(
      published
        ? {
          title: `${title.trim()} gepubliceerd`,
          body: `De klantagent en ${AUDIENCE_LABEL.assistant} antwoorden er vanaf nu uit.`,
          tone: "good"
        }
        : { title: "Concept opgeslagen", body: "De agents gebruiken nog de gepubliceerde versie.", tone: "good" }
    )
  }
  const insert = (text: string) => setBody((b) => `${b.trimEnd()}${b.trim() === "" ? "" : "\n\n"}${text}`)
  const versions = article.versions.toReversed()
  const chosen = versions.find((v) => v.n === (picked ?? last.n)) ?? last
  const previous = article.versions.find((v) => v.n === chosen.n - 1)

  return (
    <SettingsPage
      title={article.title}
      width="record"
      area="settings"
      what="de kennisbank"
      meta={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Status tone={s.tone}>{s.word}</Status>
          <span>
            {AUDIENCE_LABEL[article.audience]} · versie {last.n} door {last.by} · {relative(last.at)} ·{" "}
            {article.uses7d}× gebruikt in 7 dagen
          </span>
        </span>
      }
      actions={
        <>
          <ButtonLink size="sm" variant="ghost" icon={<ArrowLeft />} to={paths.settings("ai/kennisbank")}>
            Kennisbank
          </ButtonLink>
          <Button size="sm" icon={<History />} onClick={() => setQuery({ versies: "1" })}>
            Versies · {article.versions.length}
          </Button>
        </>
      }
    >
      {question !== null && (
        <p className="rounded-md bg-accent-tint px-3 py-2.5 text-sm text-accent-ink">
          Een klant vroeg: “{question}”. Schrijf het antwoord hieronder.
        </p>
      )}

      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label="Titel">
            {(c) => <Input {...c} disabled={!edit} value={title} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink">Voor</span>
            <Segmented
              label="Voor"
              size="md"
              disabled={!edit}
              value={audience}
              onChange={setAudience}
              options={AUDIENCES}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <Button size="sm" variant="ghost" disabled={!edit || preview} onClick={() => insert("## Kop")}>
                Kop
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<ListGlyph />}
                disabled={!edit || preview}
                onClick={() => insert("- ")}
              >
                Lijst
              </Button>
              <Button
                size="sm"
                variant={preview ? "secondary" : "ghost"}
                aria-pressed={preview}
                onClick={() => setPreview(!preview)}
              >
                Voorbeeld
              </Button>
            </span>
            <span className={cx("figure text-xs", tooLong ? "text-bad-ink" : "text-ink-3")}>
              {figure(body.length)} van {figure(KNOWLEDGE_LIMIT)} tekens
            </span>
          </div>
          {preview
            ? (
              <div className="min-h-80 rounded-md bg-well px-5 py-4">
                {body.trim() === ""
                  ? <p className="text-sm text-ink-3">Nog niets om te tonen.</p>
                  : <Preview body={body} />}
              </div>
            )
            : (
              <Textarea
                aria-label="Tekst"
                rows={18}
                disabled={!edit}
                placeholder={"## Kop\n\nWat de klant moet weten, in korte zinnen."}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            )}
          {edit && body.trim() === "" && !preview && (
            <Button
              size="sm"
              className="self-start"
              icon={<Sparkles />}
              loading={writing}
              onClick={() => {
                setWriting(true)
                window.setTimeout(() => {
                  setBody(DRAFT_FROM_MAGNUS)
                  setWriting(false)
                }, 1100)
              }}
            >
              {writing ? `${ASSISTANT} schrijft…` : `Laat ${ASSISTANT} een eerste tekst schrijven`}
            </Button>
          )}
        </div>

        {edit && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && <span className="mr-auto text-xs text-ink-3">Niet opgeslagen</span>}
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  setTitle(article.title)
                  setAudience(article.audience)
                  setBody(last.body)
                }}
              >
                Negeren
              </Button>
            )}
            <Button disabled={!dirty} onClick={() => store(false)}>Opslaan als concept</Button>
            <Button variant="primary" disabled={!dirty && last.published} onClick={() => store(true)}>
              Publiceren
            </Button>
          </div>
        )}
      </div>

      <Sheet
        open={versionsOpen}
        onClose={() => {
          setQuery({ versies: null })
          setPicked(null)
        }}
        title="Versies"
        meta={article.title}
        footer={edit && chosen.n !== last.n
          ? (
            <Button
              variant="primary"
              onClick={() => {
                setBody(chosen.body)
                setQuery({ versies: null })
                setPicked(null)
                toast({ title: `Versie ${chosen.n} teruggezet`, body: "Sla op of publiceer om hem te bewaren." })
              }}
            >
              Terugzetten
            </Button>
          )
          : undefined}
      >
        <div className="flex flex-col gap-5">
          <List divided label="Versies">
            {versions.map((v) => (
              <ListRow
                key={v.n}
                padded={false}
                onClick={() => setPicked(v.n)}
                title={
                  <span className={cx(v.n === chosen.n && "font-semibold")}>
                    Versie {v.n} · {v.by} · {dateOf(v)}
                  </span>
                }
                trail={
                  <Status tone={v.published ? "good" : "neutral"}>{v.published ? "Gepubliceerd" : "Concept"}</Status>
                }
              />
            ))}
          </List>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-ink-3">
              {previous === undefined ? `Versie ${chosen.n}, de eerste` : `Wat versie ${chosen.n} veranderde`}
            </h3>
            <DiffView lines={diffLines(previous?.body ?? "", chosen.body)} />
          </div>
        </div>
      </Sheet>
    </SettingsPage>
  )
}

function DiffView({ lines }: { readonly lines: ReadonlyArray<{ kind: "same" | "add" | "del"; text: string }> }) {
  const sign: Readonly<Record<string, ReactNode>> = { add: "+", del: "−", same: " " }
  return (
    <div className="flex flex-col rounded-md bg-well py-2 text-sm">
      {lines.map((l, i) => (
        <Fragment key={i}>
          <p
            className={cx(
              "grid grid-cols-[1.25rem_minmax(0,1fr)] px-3 py-0.5 whitespace-pre-wrap",
              l.kind === "add" && "bg-good-tint text-good-ink",
              l.kind === "del" && "bg-bad-tint text-bad-ink line-through decoration-1",
              l.kind === "same" && "text-ink-2"
            )}
          >
            <span aria-hidden="true">{sign[l.kind]}</span>
            <span>
              <span className="sr-only">
                {l.kind === "add" ? "Toegevoegd: " : l.kind === "del" ? "Weggehaald: " : ""}
              </span>
              {l.text === "" ? " " : l.text}
            </span>
          </p>
        </Fragment>
      ))}
    </div>
  )
}
