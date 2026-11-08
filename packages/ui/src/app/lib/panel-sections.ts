import type { PanelSection } from "../stores/panel-store"

/** What each part of the area panel is called in Customize, and what it holds. */
export const SECTION_LABEL: Record<PanelSection, { label: string; hint: string }> = {
  navigation: { label: "Navigatie", hint: "De pagina's en selecties van dit onderdeel" },
  report: { label: "Weekrapport", hint: "Het rapport van maandag, tot je het hebt gelezen" },
  shortcuts: { label: "Snelkoppelingen", hint: "Vastgezette items, opgeslagen weergaven en wat je opende" }
}
