import { decide, getDemo, setNotesRead } from "../../demo.ts"
import { markNotes, NOTIFICATIONS } from "../../fixtures/notifications.ts"
import type { NoteFixture } from "../../fixtures/notifications.ts"
import { toast } from "../../ui/toast.tsx"

/*
 * What the page does to notes, each with its way back: read, set aside, clear, bring back, do the
 * note's act. The marks live in the fixture (`fixtures/notifications.ts`); the bell listens to the
 * demo store, so every change also tells that store to look again.
 */

const plural = (n: number) => `${n} ${n === 1 ? "melding" : "meldingen"}`

/** The bell re-reads on a demo-store change; setting `notesRead` to what it is makes it look again. */
const ping = () => setNotesRead(getDemo().notesRead)

function change(ids: ReadonlyArray<string>, patch: Parameters<typeof markNotes>[1]) {
  const undo = markNotes(ids, patch)
  ping()
  return () => {
    undo()
    ping()
  }
}

export function setRead(ids: ReadonlyArray<string>, read: boolean) {
  if (!read && getDemo().notesRead) {
    // Everything was read in one go (the bell); bringing some back means the rest stay read, one by one.
    markNotes(NOTIFICATIONS.map((n) => n.id), { read: true })
    setNotesRead(false)
  }
  return change(ids, { read })
}

/** "Gelezen" for several, said once with the way back. */
export function readMany(ids: ReadonlyArray<string>) {
  if (ids.length === 0) return
  const undo = setRead(ids, true)
  if (ids.length > 1) {
    toast({ title: `${plural(ids.length)} gelezen`, action: { label: "Ongedaan maken", onClick: undo } })
  }
}

export function clearNotes(ids: ReadonlyArray<string>) {
  if (ids.length === 0) return
  const undo = change(ids, { box: "gewist", until: undefined })
  toast({
    title: ids.length === 1 ? "Melding gewist" : `${plural(ids.length)} gewist`,
    body: "Ze staan onder Gewist tot je ze terugzet.",
    action: { label: "Ongedaan maken", onClick: undo }
  })
}

export function snoozeNotes(ids: ReadonlyArray<string>, until: string) {
  if (ids.length === 0) return
  const undo = change(ids, { box: "later", until })
  toast({
    title: `${ids.length === 1 ? "Uitgesteld" : `${plural(ids.length)} uitgesteld`} tot ${until}`,
    action: { label: "Ongedaan maken", onClick: undo }
  })
}

export function restoreNotes(ids: ReadonlyArray<string>) {
  if (ids.length === 0) return
  const undo = change(ids, { box: "inbox", until: undefined })
  toast({
    title: ids.length === 1 ? "Terug in je inbox" : `${plural(ids.length)} terug in je inbox`,
    action: { label: "Ongedaan maken", onClick: undo }
  })
}

/** The note's act, done from the preview: a proposal decided where Start sees it too, the note read. */
export function doAct(note: NoteFixture) {
  const act = note.act
  if (act === undefined) return
  const proposal = act.proposal
  if (proposal !== undefined) decide(proposal, "done")
  const undo = change([note.id], { done: true, read: true })
  toast({
    title: act.done,
    body: note.record,
    tone: "good",
    action: {
      label: "Ongedaan maken",
      onClick: () => {
        undo()
        if (proposal !== undefined) decide(proposal, "open")
      }
    }
  })
}
