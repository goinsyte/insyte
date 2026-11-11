import { type ReactElement, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover"
import { Search } from "../../icons"
import { cn } from "../lib/utils"

/**
 * The emoji a support team reaches for, findable by name. Grouped the way they get used — answers,
 * the work itself, how something went — rather than by Unicode block, and with the ones this
 * operator picked last at the front.
 */
const GROUPS: ReadonlyArray<{ label: string; emoji: ReadonlyArray<[string, string]> }> = [
  {
    label: "Antwoorden",
    emoji: [
      ["👍", "duim omhoog ja thumbs up yes"],
      ["👎", "duim omlaag nee thumbs down no"],
      ["✅", "klaar vinkje gedaan done check"],
      ["❌", "nee kruis no cross"],
      ["👀", "ogen kijken eyes looking"],
      ["🙏", "bedankt alsjeblieft dank thanks please"],
      ["👏", "applaus klappen clap"],
      ["🙌", "hoera hooray"],
      ["💯", "honderd hundred"],
      ["🤝", "deal handdruk afspraak handshake"],
      ["👌", "oké ok"],
      ["✋", "wacht stop wait"]
    ]
  },
  {
    label: "Werk",
    emoji: [
      ["📦", "pakket pakje bestelling package parcel order"],
      ["🚚", "vrachtwagen verzending bezorging truck shipping delivery"],
      ["✈️", "vliegtuig luchtvracht plane air freight"],
      ["🏷️", "label tag"],
      ["💳", "pinpas kaart betaling card payment"],
      ["💶", "euro geld money"],
      ["🧾", "bon factuur receipt invoice"],
      ["📈", "grafiek omhoog groei chart up growth"],
      ["📉", "grafiek omlaag daling chart down drop"],
      ["📝", "notitie schrijven note write"],
      ["📎", "bijlage paperclip attachment clip"],
      ["📅", "agenda datum kalender calendar date"],
      ["⏰", "wekker deadline alarm"],
      ["🔒", "slot beveiligd lock secure"],
      ["🔗", "link"],
      ["📧", "e-mail mail email"]
    ]
  },
  {
    label: "Hoe het ging",
    emoji: [
      ["🎉", "feest vieren party celebrate"],
      ["🚀", "raket lancering live rocket ship launch"],
      ["🔥", "vuur heet fire hot"],
      ["⭐", "ster star"],
      ["💪", "sterk strong"],
      ["😅", "pfoe zweet phew sweat"],
      ["😬", "grimas ongemakkelijk grimace awkward"],
      ["🤔", "nadenken denken thinking"],
      ["😂", "lachen laugh"],
      ["🙂", "glimlach smile"],
      ["😢", "verdrietig sad"],
      ["🤯", "verbijsterd mind blown"],
      ["⚠️", "waarschuwing let op warning"],
      ["🐛", "bug fout"],
      ["🧯", "brandblusser incident fire extinguisher"],
      ["☕", "koffie pauze coffee break"]
    ]
  }
]

const RECENT_KEY = "insyte.emoji.recent"

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 8) : []
  } catch {
    return []
  }
}

function remember(e: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, 8)))
  } catch {
    // A private window keeps no recents; the picker works the same without them.
  }
}

export function EmojiPicker({
  onPick,
  children,
  side = "top",
  label = "Kies een emoji"
}: {
  onPick: (emoji: string) => void
  children: ReactElement
  side?: "top" | "bottom"
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [recent, setRecent] = useState<string[]>([])
  const query = q.trim().toLowerCase()
  const groups = query
    ? [{
      label: "Resultaten",
      emoji: GROUPS.flatMap((g) => g.emoji).filter(([e, n]) => n.includes(query) || e === query)
    }]
    : [
      ...(recent.length > 0 ? [{ label: "Recent", emoji: recent.map((e) => [e, ""] as [string, string]) }] : []),
      ...GROUPS
    ]

  function pick(e: string) {
    remember(e)
    onPick(e)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) {
          setQ("")
          setRecent(readRecent())
        }
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align="start" className="flex w-[296px] flex-col gap-2 p-2" aria-label={label}>
        <label className="field flex h-8 items-center gap-2 rounded-md px-2.5 focus-within:bg-paper">
          <Search className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              const first = groups[0]?.emoji[0]?.[0]
              if (e.key === "Enter" && first) {
                e.preventDefault()
                pick(first)
              }
            }}
            placeholder="Emoji zoeken"
            aria-label="Emoji zoeken"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {groups.map((g) =>
            g.emoji.length === 0 ?
              (
                <p key={g.label} className="px-1 py-4 text-center text-sm text-ink-3">
                  Geen emoji gevonden voor “{q}”.
                </p>
              ) :
              (
                <section key={g.label} className="flex flex-col gap-1">
                  <h3 className="px-1 font-medium text-ink-3 text-xs">{g.label}</h3>
                  <div className="grid grid-cols-8 gap-0.5">
                    {g.emoji.map(([e, name]) => (
                      <button
                        key={e}
                        type="button"
                        title={name ? name.split(" ")[0] : e}
                        aria-label={name ? name.split(" ")[0] : e}
                        onClick={() => pick(e)}
                        className={cn(
                          "flex size-8 cursor-pointer items-center justify-center rounded-md text-lg hover:bg-ink/6"
                        )}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </section>
              )
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
