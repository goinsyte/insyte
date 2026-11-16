/*
 * What the console says when undoing a Klantagent save is refused (M15 step 8): the settings changed again since
 * (`Conflict`: the undo would throw that save away), the role may not put them back (`Forbidden`: putting them back
 * would let Insyte do more by itself, which asks for `ai.autonomy`), or the undo's time ran out.
 */

export interface UndoRefusal {
  readonly title: string
  readonly description?: string
}

export const undoRefusal = (error: unknown): UndoRefusal => {
  const tag = typeof error === "object" && error !== null && "_tag" in error ? error._tag : null
  if (tag === "Conflict") {
    return { title: "Niet ongedaan gemaakt", description: "Er is intussen iets anders opgeslagen." }
  }
  if (tag === "Forbidden") {
    return {
      title: "Niet ongedaan gemaakt",
      description: "Je rol mag deze instellingen niet terugzetten: daarmee doet Insyte weer meer zelf."
    }
  }
  return { title: "Te laat om ongedaan te maken" }
}
