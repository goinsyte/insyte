import type { ComponentType } from "react"
import type { Badge, Course, Progress } from "../../fixtures/courses.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Status } from "../../ui/badge.tsx"
import { Flag, Key, MessageSquare, Package, Shield, Star } from "../../ui/icons.tsx"
import type { Run } from "./store.ts"

type Glyph = ComponentType<{ readonly size?: number; readonly className?: string }>

export const BADGE_GLYPH: Readonly<Record<Badge, Glyph>> = {
  star: Star,
  shield: Shield,
  parcel: Package,
  chat: MessageSquare,
  flag: Flag,
  key: Key
}

export const personName = (p: keyof typeof PEOPLE) => PEOPLE[p].name

/** Elena's state in a course: her own run in this demo first, then the seeded progress. */
export function mine(c: Course, run: Run, seeded: Progress | undefined) {
  if (run.finished !== undefined) {
    return {
      kind: run.finished.passed ? "gehaald" : "niet-gehaald",
      done: c.blocks.length,
      score: run.finished.score
    } as const
  }
  if (run.done.length > 0) return { kind: "bezig", done: run.done.length, score: undefined } as const
  if (seeded?.finished !== undefined) {
    return {
      kind: (seeded.score ?? 0) >= c.passMark ? "gehaald" : "niet-gehaald",
      done: seeded.done,
      score: seeded.score
    } as const
  }
  if (seeded !== undefined && seeded.done > 0) return { kind: "bezig", done: seeded.done, score: undefined } as const
  return { kind: "nieuw", done: 0, score: undefined } as const
}

/** One person's state in one course, for the team view. */
export function ProgressLabel(
  { course, progress }: { readonly course: Course; readonly progress: Progress | undefined }
) {
  if (progress === undefined) {
    return course.overdue === true
      ? <Status tone="bad">Niet begonnen, te laat</Status>
      : <span className="text-ink-4">—</span>
  }
  if (progress.finished !== undefined) {
    const passed = (progress.score ?? 0) >= course.passMark
    return (
      <span className="flex flex-col">
        <Status tone={passed ? "good" : "warn"}>{passed ? "Gehaald" : "Niet gehaald"}</Status>
        <span className="figure text-xs text-ink-3">
          {progress.score ?? 0}%{progress.attempts > 1 ? ` · ${progress.attempts} pogingen` : ""} · {progress.finished}
        </span>
      </span>
    )
  }
  return (
    <span className="flex flex-col">
      <Status tone={course.overdue === true ? "bad" : "neutral"}>
        {course.overdue === true ? "Bezig, te laat" : "Bezig"}
      </Status>
      <span className="figure text-xs text-ink-3">{progress.done} van {course.blocks.length} blokken</span>
    </span>
  )
}
