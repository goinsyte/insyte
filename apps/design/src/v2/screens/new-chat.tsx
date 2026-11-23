import { useState } from "react"
import { ASSISTANT } from "../assistant.ts"
import { myWork, openProposals, useDemo } from "../demo.ts"
import type { Glyph } from "../fixtures/agents.ts"
import { SUGGESTIONS } from "../fixtures/assistant.ts"
import { LOG } from "../fixtures/magnus.ts"
import { ME } from "../fixtures/workspace.ts"
import { Link, navigate, paths } from "../router.tsx"
import { Composer } from "../ui/composer.tsx"
import { ArrowUp, BarChart3, CreditCard, Factory, Inbox, Mail, Sparkle } from "../ui/icons.tsx"
import { MagnusMark } from "../ui/magnus-mark.tsx"

/** The demo's scripted conversations; a first message opens the one closest to it. */
const open = (chatId: string) => () => navigate(paths.chat(chatId))
const start = open("terugbetalingen")

type Starter = { readonly text: string; readonly hint: string; readonly glyph: Glyph; readonly go: () => void }

/**
 * Where to begin: what the original "Vraag Insyte" offered as its four commands (summarise today,
 * what threatens to be late, draft a reply, which chargebacks need evidence), each with what it does,
 * and the week's summary for the team.
 */
const STARTERS: ReadonlyArray<Starter> = [
  { text: "Vat de open zaken van vandaag samen", hint: "Wat vandaag op jou wacht", glyph: Inbox, go: start },
  {
    text: "Welke bestellingen dreigen te laat te komen?",
    hint: "Per leverancier en vervoerder",
    glyph: Factory,
    go: start
  },
  {
    text: "Stel een antwoord op aan Luca Romano",
    hint: "Over zijn vertraagde levering, als concept",
    glyph: Mail,
    go: start
  },
  {
    text: "Welke chargebacks hebben bewijs nodig?",
    hint: "Zaken die op bewijs wachten",
    glyph: CreditCard,
    go: open("geschil")
  },
  { text: SUGGESTIONS[2], hint: "Voor het overleg van maandag", glyph: BarChart3, go: start }
]

/** With context attached, the first starters are about that thing. */
const aboutContext = (context: string): ReadonlyArray<Starter> => [
  { text: `Wat moet ik weten over ${context}?`, hint: "Uit de records die eraan hangen", glyph: Sparkle, go: start },
  { text: `Wat zou jij doen met ${context}?`, hint: "Als voorstel, binnen je regels", glyph: Sparkle, go: start }
]

/**
 * A new conversation. When the werkdraad sent you here ("Vraag Magnus" in the main bar), what you
 * were working on is already attached as context, so the first question can be short and the first
 * starters are about it. Magnus says what it already read (today's queue) and where its own work
 * stands, so the page is not a blank prompt.
 */
export function NewChatScreen({ context }: { readonly context: string | null }) {
  const demo = useDemo()
  const [attached, setAttached] = useState<ReadonlyArray<string>>(context === null ? [] : [context])
  const waiting = myWork(demo)
  const proposals = openProposals(demo)
  const done = LOG.filter((line) => line.status === "gedaan").length
  const starters = [...attached.flatMap((item) => aboutContext(item)).slice(0, 2), ...STARTERS].slice(
    0,
    attached.length > 0 ? 5 : STARTERS.length
  )

  return (
    <div className="pane-scroll flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
      <div className="flex w-full max-w-[40rem] flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <MagnusMark size={36} />
          <h1 className="text-xl font-semibold text-balance text-ink">
            Waar kan ik je mee helpen, {ME.name.split(" ")[0]}?
          </h1>
          <p className="max-w-md text-sm text-balance text-ink-3">
            Ik heb de wachtrij van vandaag gelezen: <span className="figure text-ink-2">{waiting}</span>{" "}
            {waiting === 1 ? "zaak wacht" : "zaken wachten"}{" "}
            op jou. Ik lees je bestellingen, tickets en leveranciers en werk binnen jouw regels; wat ik niet zelf mag,
            leg ik je eerst voor.
          </p>
        </div>
        <Composer
          autoFocus
          label={`Bericht aan ${ASSISTANT}`}
          placeholder={`Vraag ${ASSISTANT} iets over Northwind`}
          context={attached}
          onRemoveContext={(item) => setAttached((list) => list.filter((x) => x !== item))}
          onSend={start}
        />
        <ul className="flex flex-col gap-px" aria-label="Begin met">
          {starters.map((starter) => (
            <li key={starter.text}>
              <button
                type="button"
                onClick={starter.go}
                className="group flex min-h-11 w-full items-center gap-3 rounded-sm px-3 py-2 text-left hover:bg-hover"
              >
                <starter.glyph size={15} className="shrink-0 text-ink-3 group-hover:text-ink-2" />
                <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="text-sm text-pretty text-ink-2 group-hover:text-ink">{starter.text}</span>
                  <span className="text-xs text-ink-3">{starter.hint}</span>
                </span>
                <ArrowUp size={14} className="shrink-0 rotate-45 text-ink-4 group-hover:text-ink-3" />
              </button>
            </li>
          ))}
        </ul>
        <p className="text-center text-xs text-pretty text-ink-3">
          <Link to={paths.log} className="hover:text-ink hover:underline">
            Je agents deden vannacht en vandaag <span className="figure">{done}</span> dingen zelf
          </Link>
          {proposals > 0 && (
            <>
              {" · "}
              <Link to={paths.approvals} className="hover:text-ink hover:underline">
                <span className="figure">{proposals}</span> {proposals === 1 ? "voorstel wacht" : "voorstellen wachten"}
                {" "}
                op je ja
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
