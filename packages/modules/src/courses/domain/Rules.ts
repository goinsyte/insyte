import type { Audience, Block, CourseInput, Quiz } from "./Courses.ts"

/*
 * The course rules the server keeps itself (widgets/05 §8, `lib/courses.ts`): what stands between a draft and
 * publishing it, who a course reaches, and the score. The console says the same blockers in Dutch from its own copy of
 * them; publishing re-runs these.
 */

const quizzes = (blocks: ReadonlyArray<Block>): ReadonlyArray<Quiz> =>
  blocks.filter((b): b is Quiz => b.kind === "quiz")

/** The codes of what still stands in the way of publishing; empty is ready. */
export const blockersOf = (c: CourseInput): ReadonlyArray<string> => {
  const out: Array<string> = []
  if (c.title.trim() === "") out.push("title")
  if (c.description.trim() === "") out.push("description")
  if (c.blocks.length === 0) out.push("blocks")
  for (const b of c.blocks) {
    if (b.kind === "text" && b.body.trim() === "") out.push(`text_empty:${b.id}`)
    if (b.kind === "video" && !/^https?:\/\//.test(b.url)) out.push(`video_url:${b.id}`)
    if (b.kind === "quiz") {
      if (b.question.trim() === "") out.push(`quiz_question:${b.id}`)
      else if (b.options.filter((o) => o.text.trim() !== "").length < 2) out.push(`quiz_options:${b.id}`)
      else if (!b.options.some((o) => o.id === b.correct && o.text.trim() !== "")) out.push(`quiz_correct:${b.id}`)
    }
  }
  if (c.audience.kind === "none" && c.suppliers.kind === "none") out.push("audience")
  return out
}

/** Whether a member is in a course's audience (the course being live is the caller's question). */
export const inAudience = (audience: Audience, member: { readonly id: string; readonly roleId: string }) =>
  audience.kind === "all" || (audience.kind === "some" &&
    (audience.roles.includes(member.roleId) || audience.members.includes(member.id)))

/** Percent of the quiz right on this attempt; a course without a quiz is passed whole. */
export const scoreOf = (blocks: ReadonlyArray<Block>, answers: Readonly<Record<string, string>>) => {
  const qs = quizzes(blocks)
  if (qs.length === 0) return 100
  return Math.round((qs.filter((q) => answers[q.id] === q.correct).length / qs.length) * 100)
}

export const hasQuiz = (blocks: ReadonlyArray<Block>) => quizzes(blocks).length > 0

/** A learner's copy: a quiz says its right answer and why only once their own answer is in. */
export const forLearner = (blocks: ReadonlyArray<Block>, answers: Readonly<Record<string, string>>) =>
  blocks.map((b) => b.kind === "quiz" && answers[b.id] === undefined ? { ...b, correct: "", explain: "" } : b)
