/*
 * Courses (PLAN 39): how the team learns the way this shop works, in chapters, modules and courses.
 *
 * A course is a short run of blocks — text, a video, an image, a quiz question — that a person reads
 * from top to bottom. The operator decides who sees it, whether the order is fixed, a deadline, the
 * badge a person gets at the end and the score a quiz needs. Progress is kept per person per course,
 * so the team page can say who is done, who is stuck and who has not started.
 */

export type CourseStatus = "draft" | "live" | "archived"

export type Block =
  | { id: string; kind: "text"; title: string; body: string }
  | { id: string; kind: "video"; title: string; url: string; minutes: number }
  | { id: string; kind: "image"; title: string; src?: string; caption: string }
  | {
    id: string
    kind: "quiz"
    question: string
    options: Array<{ id: string; text: string }>
    correct: string
    explain: string
  }

export type BlockKind = Block["kind"]

export type Audience = { kind: "all" } | { kind: "some"; roles: string[]; members: string[] } | { kind: "none" }
export type SupplierAccess = { kind: "none" } | { kind: "all" } | { kind: "some"; ids: string[] }

/** The drawn badges a course can end on. Each is a house glyph on a small plate. */
export const BADGES = ["star", "shield", "parcel", "chat", "flag", "key"] as const
export type BadgeId = (typeof BADGES)[number]

export type Course = {
  id: string
  title: string
  chapterId: string
  moduleId: string
  description: string
  blocks: Block[]
  status: CourseStatus
  /** Free: read the blocks in any order. Fixed: one after the other. */
  order: "free" | "fixed"
  audience: Audience
  suppliers: SupplierAccess
  /** ISO date (yyyy-mm-dd), or empty. */
  deadline: string
  badge: BadgeId
  /** Percent of quiz questions right to pass. */
  passMark: number
  /** Whether a person can ask a question about it; questions go to whoever made it. */
  questions: boolean
  createdBy: string
  updatedAt: string
  publishedAt?: string
}

export type Module = { id: string; title: string }
export type Chapter = { id: string; title: string; modules: Module[] }

export type Progress = {
  courseId: string
  memberId: string
  /** Block ids the person has been through. */
  done: string[]
  /** Quiz answers of the current attempt, by block id. */
  answers: Record<string, string>
  attempts: number
  /** Percent right on the last finished attempt. */
  score?: number
  startedAt: string
  finishedAt?: string
}

export type CourseQuestion = {
  id: string
  courseId: string
  memberId: string
  blockId?: string
  text: string
  at: string
  answer?: string
  answeredBy?: string
}

export type CoursesSeed = { chapters: Chapter[]; courses: Course[]; progress: Progress[]; questions: CourseQuestion[] }

export const STATUS_LABEL: Record<CourseStatus, string> = { draft: "Concept", live: "Live", archived: "Gearchiveerd" }

export const BLOCK_LABEL: Record<BlockKind, string> = {
  text: "Tekst",
  video: "Video",
  image: "Afbeelding",
  quiz: "Quizvraag"
}

export const BADGE_LABEL: Record<BadgeId, string> = {
  star: "Ster",
  shield: "Schild",
  parcel: "Pakket",
  chat: "Gesprek",
  flag: "Vlag",
  key: "Sleutel"
}

/** Reading time: 200 words a minute for text, a video's own length, half a minute per question or image. */
export function minutesOf(c: Pick<Course, "blocks">): number {
  let m = 0
  for (const b of c.blocks) {
    if (b.kind === "text") m += b.body.split(/\s+/).filter(Boolean).length / 200
    else if (b.kind === "video") m += b.minutes
    else m += 0.5
  }
  return Math.max(1, Math.round(m))
}

export const quizzesOf = (c: Pick<Course, "blocks">) =>
  c.blocks.filter((b): b is Extract<Block, { kind: "quiz" }> => b.kind === "quiz")

/** Who the course reaches, said the way the editor says it. */
export function audienceLine(a: Audience, suppliers: SupplierAccess): string {
  const team = a.kind === "all"
    ? "Hele team"
    : a.kind === "none"
    ? "Niemand van het team"
    : [
      ...a.roles,
      ...(a.members.length ? [`${a.members.length} ${a.members.length === 1 ? "persoon" : "personen"}`] : [])
    ].join(", ") || "Niemand gekozen"
  const sup = suppliers.kind === "all"
    ? " · alle leveranciers"
    : suppliers.kind === "some"
    ? ` · ${suppliers.ids.length} ${suppliers.ids.length === 1 ? "leverancier" : "leveranciers"}`
    : ""
  return team + sup
}

/** Whether a member is meant to take a course. */
export function reaches(c: Course, member: { id: string; role: string }): boolean {
  if (c.status !== "live") return false
  if (c.audience.kind === "all") return true
  if (c.audience.kind === "none") return false
  return c.audience.roles.includes(member.role) || c.audience.members.includes(member.id)
}

export type PersonState = "done" | "busy" | "todo" | "late" | "failed"

export const PERSON_STATE_LABEL: Record<PersonState, string> = {
  done: "Klaar",
  busy: "Bezig",
  todo: "Niet begonnen",
  late: "Te laat",
  failed: "Niet gehaald"
}

/** Where a person stands on a course today. */
export function stateOf(c: Course, p: Progress | undefined, now: number): PersonState {
  if (p?.finishedAt && (p.score === undefined || p.score >= c.passMark)) return "done"
  if (p?.finishedAt) return "failed"
  if (c.deadline && Date.parse(`${c.deadline}T23:59:59`) < now) return "late"
  return p && p.done.length > 0 ? "busy" : "todo"
}

/** Share of blocks done, 0–1. */
export const shareDone = (
  c: Course,
  p: Progress | undefined
) => (c.blocks.length && p
  ? Math.min(1, p.done.filter((id) => c.blocks.some((b) => b.id === id)).length / c.blocks.length)
  : 0)

/** What still stands between a draft and publishing it, as sentences. Empty means ready. */
export function blockers(c: Course): string[] {
  const out: string[] = []
  if (!c.title.trim()) out.push("Geef de cursus een naam")
  if (!c.description.trim()) out.push("Schrijf in een zin wat iemand leert")
  if (c.blocks.length === 0) out.push("Voeg minstens één blok toe")
  for (const b of c.blocks) {
    if (b.kind === "text" && !b.body.trim()) out.push(`Het tekstblok “${b.title || "zonder titel"}” is leeg`)
    if (b.kind === "video" && !/^https?:\/\//.test(b.url)) {
      out.push(`De video “${b.title || "zonder titel"}” heeft geen link`)
    }
    if (b.kind === "quiz") {
      if (!b.question.trim()) out.push("Een quizvraag heeft nog geen vraag")
      else if (b.options.filter((o) => o.text.trim()).length < 2) {
        out.push(`“${b.question}” heeft minder dan twee antwoorden`)
      } else if (!b.options.some((o) => o.id === b.correct && o.text.trim())) {
        out.push(`“${b.question}” heeft geen goed antwoord`)
      }
    }
  }
  if (c.audience.kind === "none" && c.suppliers.kind === "none") out.push("Kies wie de cursus ziet")
  return out
}

let seq = 0
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`

export function emptyBlock(kind: BlockKind): Block {
  const id = newId("blk")
  if (kind === "text") return { id, kind, title: "", body: "" }
  if (kind === "video") return { id, kind, title: "", url: "", minutes: 3 }
  if (kind === "image") return { id, kind, title: "", caption: "" }
  const a = newId("opt")
  return {
    id,
    kind,
    question: "",
    options: [{ id: a, text: "" }, { id: newId("opt"), text: "" }, { id: newId("opt"), text: "" }],
    correct: a,
    explain: ""
  }
}

/**
 * Insyte's quiz questions for a course, drawn from its own text: a sentence that states a fact with a
 * number or a rule in it becomes a question whose right answer is that fact and whose wrong answers
 * are the same sentence with the figure moved. A proposal, never written into the course by itself.
 */
export function suggestQuestions(c: Pick<Course, "blocks">, max = 3): Array<Extract<Block, { kind: "quiz" }>> {
  const sentences = c.blocks
    .flatMap((b) => (b.kind === "text" ? b.body.split(/(?<=[.!?])\s+|\n+/) : []))
    .map((s) => s.replace(/^[-#*\d.\s]+/, "").trim())
    .filter((s) => s.length > 24 && s.length < 160 && /\d/.test(s))
  const out: Array<Extract<Block, { kind: "quiz" }>> = []
  for (const s of sentences) {
    const m = s.match(/(\d+(?:[.,]\d+)?)/)
    if (!m?.[1]) continue
    const n = Number(m[1].replace(",", "."))
    const fmt = (x: number) => String(Number.isInteger(n) ? Math.round(x) : x.toFixed(2)).replace(".", ",")
    const wrong = [n * 2, Math.max(1, n / 2)].map((x) => s.replace(m[1]!, fmt(x)))
    const right = { id: newId("opt"), text: s }
    const options = [right, ...wrong.map((text) => ({ id: newId("opt"), text }))].sort((a, b) =>
      a.text.length - b.text.length
    )
    out.push({ id: newId("blk"), kind: "quiz", question: "Welke zin klopt?", options, correct: right.id, explain: s })
    if (out.length >= max) break
  }
  return out
}

/** "€ 49" style labels are not needed here; dates are. */
export const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  )

/** How a video link is shown: its host, so a person sees where it plays. */
export function videoHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}
