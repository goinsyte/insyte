import { useState } from "react"
import { CornerDownLeft } from "../../icons"
import { InsyteMark } from "../ask/parts"

/**
 * Ask about the numbers: one field. Starting questions show only while the field has focus. The
 * field and the answers are separate so the field can sit in the sidebar while answers land in the
 * reading column; what answers is the host's (`analytics-source.tsx`).
 */
export function AskField({ onAsk, suggested }: { onAsk: (q: string) => void; suggested: ReadonlyArray<string> }) {
  const [q, setQ] = useState("")
  const [focused, setFocused] = useState(false)

  function submit(text: string) {
    const t = text.trim()
    if (!t) return
    onAsk(t)
    setQ("")
  }

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(q)
        }}
        className="field flex h-10 items-center gap-2.5 rounded-lg pr-1 pl-2 focus-within:bg-paper focus-within:ring-2 focus-within:ring-arc/25"
      >
        <InsyteMark size={22} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Vraag iets over deze cijfers"
          aria-label="Vraag iets over deze cijfers"
          className="min-w-0 flex-1 bg-transparent text-ink text-sm outline-none placeholder:text-ink-3"
        />
        {q.trim() ?
          (
            <button
              type="submit"
              aria-label="Vragen"
              className="flex size-8 cursor-pointer items-center justify-center rounded-md bg-abyss text-mesh-ink hover:bg-abyss-2"
            >
              <CornerDownLeft className="size-3.5" strokeWidth={2} />
            </button>
          ) :
          null}
      </form>
      {focused && !q ?
        (
          <ul
            aria-label="Vragen om mee te beginnen"
            className="panel-raised absolute top-full right-0 left-0 z-20 mt-1.5 flex w-[min(320px,calc(100vw-2rem))] flex-col rounded-xl p-1.5"
          >
            {suggested.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    submit(s)
                  }}
                  className="flex min-h-8 w-full cursor-pointer items-center rounded-md px-2.5 py-1.5 text-left text-ink-2 text-sm hover:bg-ink/5 hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        ) :
        null}
    </div>
  )
}
