import { useState } from "react"
import { dayKey } from "../lib/home/dates"
import { useHome } from "../stores/home-store"
import { AgendaView } from "./agenda-view"
import { useDay } from "./use-day"

/** The agenda in the demo: the day's moments from its stores (`agenda-view.tsx` draws them). */
export function Agenda() {
  const { now, moments } = useDay()
  const span = useHome((s) => s.agendaSpan)
  const setSpan = useHome((s) => s.setAgendaSpan)
  const [day, setDay] = useState(() => dayKey(now))
  return <AgendaView now={now} moments={moments} span={span} onSpan={setSpan} day={day} onDay={setDay} />
}
