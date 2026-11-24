import { useEffect, useState } from "react"
import { getAffiliateState, REJECT_REASONS, setAffiliateState, TIERS } from "../../fixtures/affiliates.ts"
import type { AffiliateState, Application, Tier } from "../../fixtures/affiliates.ts"
import { Button } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { toast } from "../../ui/toast.tsx"

/** Change the demo's programme and offer the way back in the toast. */
export function withUndo(title: string, body: string | undefined, change: (s: AffiliateState) => AffiliateState) {
  const before = getAffiliateState()
  setAffiliateState(change)
  toast({
    title,
    ...(body === undefined ? {} : { body }),
    tone: "good",
    action: { label: "Ongedaan maken", onClick: () => setAffiliateState(() => before) }
  })
}

const TIER_OPTIONS = TIERS.map((t) => ({ value: t.id, label: `${t.label}, ${t.rate}% commissie` }))

/** Goedkeuren: the tier they start on. They get their code and their link by mail. */
export function ApproveDialog({ app, onClose }: { readonly app: Application | null; readonly onClose: () => void }) {
  const [tier, setTier] = useState<Tier>("brons")
  useEffect(() => {
    if (app !== null) setTier("brons")
  }, [app])
  if (app === null) return null
  const approve = () => {
    withUndo(`${app.name} goedgekeurd`, "Ze krijgen een mail met hun code en hun link naar het portaal.", (s) => ({
      ...s,
      decisions: { ...s.decisions, [app.id]: { status: "goedgekeurd", tier } }
    }))
    onClose()
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`${app.name} goedkeuren`}
      description={`${app.channel} · ${app.audience}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={approve}>Goedkeuren</Button>
        </>
      }
    >
      <div className="pb-1">
        <RadioGroup label="Ze beginnen op" value={tier} onChange={setTier} options={TIER_OPTIONS} />
      </div>
    </Dialog>
  )
}

/** Afwijzen: one of the usual reasons, or their own; the applicant reads it in the mail. */
export function RejectDialog({ app, onClose }: { readonly app: Application | null; readonly onClose: () => void }) {
  const [reason, setReason] = useState<string>(REJECT_REASONS[0])
  const [own, setOwn] = useState("")
  useEffect(() => {
    if (app !== null) {
      setReason(REJECT_REASONS[0])
      setOwn("")
    }
  }, [app])
  if (app === null) return null
  const text = reason === "eigen" ? own.trim() : reason
  const reject = () => {
    withUndo(`${app.name} afgewezen`, "Ze krijgen een mail met je reden.", (s) => ({
      ...s,
      decisions: { ...s.decisions, [app.id]: { status: "afgewezen", reason: text } }
    }))
    onClose()
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${app.name} afwijzen`}
      description="De reden staat in de mail die ze krijgen. Ze kunnen zich later opnieuw aanmelden."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="danger" disabled={text === ""} onClick={reject}>Afwijzen</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <RadioGroup
          label="Reden"
          value={reason}
          onChange={setReason}
          options={[...REJECT_REASONS.map((r) => ({ value: r, label: r })), { value: "eigen", label: "Eigen reden" }]}
        />
        {reason === "eigen" && (
          <Field label="Je reden">
            {(control) => <Textarea {...control} rows={3} value={own} onChange={(e) => setOwn(e.target.value)} />}
          </Field>
        )}
      </div>
    </Dialog>
  )
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Uitnodigen: someone you found yourself skips the application and starts on the tier you pick. */
export function InviteDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [tier, setTier] = useState<Tier>("zilver")
  const [message, setMessage] = useState("")
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (open) {
      setName("")
      setEmail("")
      setTier("zilver")
      setMessage("")
      setTried(false)
    }
  }, [open])
  const errors = {
    name: name.trim() === "" ? "Naam is verplicht" : undefined,
    email: !EMAIL.test(email.trim()) ? "Vul een geldig e-mailadres in" : undefined
  }
  const send = () => {
    setTried(true)
    if (errors.name !== undefined || errors.email !== undefined) return
    const id = `uitnodiging-${Date.now()}`
    withUndo(`Uitnodiging verstuurd naar ${name.trim()}`, "De link is 14 dagen geldig.", (s) => ({
      ...s,
      invites: [
        {
          id,
          name: name.trim(),
          email: email.trim(),
          tier,
          message: message.trim(),
          sent: "vandaag",
          expires: "ma 7 dec"
        },
        ...s.invites
      ]
    }))
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Affiliate uitnodigen"
      description="Wie je uitnodigt, slaat de aanmelding over en begint op de tier die je kiest."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={send}>Uitnodiging versturen</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Naam" error={tried ? errors.name : undefined}>
            {(control) => <Input {...control} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="E-mail" error={tried ? errors.email : undefined}>
            {(control) => <Input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
        </div>
        <RadioGroup label="Tier" value={tier} onChange={setTier} options={TIER_OPTIONS} />
        <Field label="Persoonlijk bericht" optional>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={message}
              placeholder="Waarom je ze vraagt, in een of twee zinnen"
              onChange={(e) => setMessage(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
