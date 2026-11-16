import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ChannelAgentView } from "@insyte/modules/channel-agent/domain/ChannelAgent"
import { widens } from "@insyte/modules/channel-agent/domain/Rules"
import type { CustomerAgentSource, TestMsg } from "@insyte/ui/app/ai/customer-agent-source"
import type { CustomerAgentSettings } from "@insyte/ui/app/lib/customer-agent"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { toast } from "sonner"
import { agentDayAtom, agentWrites, CUSTOMER_AGENT } from "../data/agent.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"
import { undoRefusal } from "./customer-agent-undo.ts"

/*
 * Klantagent in the console (M15 step 8): `ChannelAgent.get` as the design's settings, its day from
 * `ChannelAgent.today` (none for a reader without Klantenservice), saved whole through `ChannelAgent.set` with its undo,
 * and the test chat through `ChannelAgent.test`, which runs the agent's own thinking on the server and sends nothing.
 * Saving needs Instellingen · Beheren; a save that lets Insyte say more by itself (`widens`, as the server decides it)
 * also `ai.autonomy`, so switching it off or narrowing it is open to whoever may manage the settings.
 */

const NO_DAY = { conversations: 0, handled: 0, handedOver: 0, waiting: 0, avgSeconds: 0 }

const settingsOf = (v: ChannelAgentView): CustomerAgentSettings => ({
  on: v.settings.on,
  channels: { ...v.settings.channels },
  hours: v.settings.hours.map((h) => ({ ...h })),
  outside: v.settings.outside,
  handover: { ...v.settings.handover, topics: [...v.settings.handover.topics] },
  tone: v.settings.tone,
  handoverMessage: v.settings.handoverMessage
})

const DAY_NAMES = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]

const notSaved = (error: unknown) =>
  sayRefusal(error, {
    gone: "De klantagent is niet meer te vinden",
    other: (tagged) => {
      if (tagged._tag === "HoursInvalid") {
        const day = tagged["day"] as number
        toast.error(
          day < 0 ? "Het overdrachtsbericht is leeg" : `De openingstijden van ${DAY_NAMES[day]} kloppen niet`,
          {
            description: day < 0
              ? "Schrijf wat de klant leest als een collega het overneemt."
              : "De sluitingstijd moet na de openingstijd liggen."
          }
        )
        return true
      }
      if (tagged._tag === "AutoNotAllowedOnChannel") {
        toast.error("Zelf antwoorden kan alleen op de websitechat", {
          description: "Op de andere kanalen zet Insyte voorlopig alleen concepten klaar."
        })
        return true
      }
      return false
    }
  })

export function useConsoleCustomerAgentSource(view: ChannelAgentView): CustomerAgentSource {
  const set = useAtomSet(agentWrites.setCustomerAgent, { mode: "promiseExit" })
  const test = useAtomSet(agentWrites.testCustomerAgent, { mode: "promiseExit" })
  const undo = useAtomSet(agentWrites.undo, { mode: "promiseExit" })
  const day = Option.getOrUndefined(AsyncResult.value(useAtomValue(agentDayAtom)))
  const settingsGate = useGate("settings", 2)
  const aiGate = useGate("ai.autonomy")

  return {
    settings: settingsOf(view),
    today: day ?? NO_DAY,
    sendReply: view.sendReply,
    webchatDetail: view.stores.join(", "),
    spent: view.budgetSpent,
    gate: settingsGate,
    save: async (next, said) => {
      if (!aiGate.ok && widens(view.settings, next)) {
        toast.error(aiGate.reason, {
          description:
            "Uitzetten en minder zelf laten doen kan wel; ruimer zetten vraagt het recht om Insyte AI te beheren."
        })
        return false
      }
      const exit = await set({ payload: next, reactivityKeys: [...CUSTOMER_AGENT] })
      if (Exit.isFailure(exit)) {
        notSaved(failureOf(exit))
        return false
      }
      const token = exit.value.undo?.token
      if (token === undefined) return true
      undoable(
        said,
        () =>
          void undo({ payload: { token }, reactivityKeys: [...CUSTOMER_AGENT] }).then((done) => {
            if (Exit.isSuccess(done)) return
            const said = undoRefusal(failureOf(done))
            toast.error(said.title, said.description === undefined ? undefined : { description: said.description })
          }),
        next.on ? "Nieuwe gesprekken volgen deze regels." : "Nieuwe gesprekken gaan naar de inbox."
      )
      return true
    },
    test: async (text, settings): Promise<TestMsg> => {
      const exit = await test({ payload: { text: text.slice(0, 1000), settings } })
      if (Exit.isFailure(exit)) {
        const error = failureOf(exit) as { _tag?: string }
        return {
          from: "insyte",
          text: error._tag === "BudgetExceeded"
            ? "De AI-limiet van deze maand is bereikt."
            : error._tag === "Forbidden"
            ? "Je rol mag de klantagent niet proberen."
            : "Insyte kon nu niet antwoorden. Probeer het zo nog eens.",
          handover: true
        }
      }
      const a = exit.value
      if (a.handover !== null) {
        return { from: "insyte", text: a.text, source: `Overgedragen: ${a.handover.label}`, handover: true }
      }
      const from = a.source === null ? undefined : `Uit Kennisbank: ${a.source.title} · versie ${a.source.version}`
      return {
        from: "insyte",
        text: a.text,
        ...(from === undefined ? {} : { source: a.mode === "drafts" ? `Als concept voor je team · ${from}` : from })
      }
    }
  }
}
