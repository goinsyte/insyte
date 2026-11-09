import type { Urls } from "../../MailUrls.ts"
import { day } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * `Portal.invite` (api.md, suppliers≥3): a brand invites a supplier's contact to its portal. Orders are always in the
 * portal; the brand chooses the rest (`portal_scopes`, domain.md §5.3).
 */

export type PortalScope = "stock" | "statements" | "chat" | "media"

const SCOPE: Record<PortalScope, string> = {
  stock: "Voorraad",
  statements: "Afrekeningen",
  chat: "Chat",
  media: "Productmedia"
}

export interface SupplierInviteProps {
  readonly url: string
  /** The brand's workspace, as the supplier knows it. */
  readonly brand: string
  readonly inviter: string
  readonly scopes: ReadonlyArray<PortalScope>
  readonly expiresAt: Date
}

export const subject = (props: SupplierInviteProps) => `${props.brand} nodigt je uit voor het leveranciersportaal`

const SupplierInvite = (props: SupplierInviteProps) => (
  <Letter
    preview={`Je bestellingen van ${props.brand} op één plek.`}
    footer={{ reason: `Je krijgt deze mail omdat ${props.brand} dit e-mailadres heeft opgegeven als contact.` }}
  >
    <Title>Het leveranciersportaal van {props.brand}</Title>
    <Lead>
      {props.inviter} van {props.brand}{" "}
      nodigde je uit voor het leveranciersportaal op Insyte. Daar zie je de bestellingen die {props.brand}{" "}
      bij je plaatst, en wat er nog verstuurd moet worden.
    </Lead>
    <Facts
      rows={[
        ["Van", props.brand],
        ["In het portaal", ["Bestellingen", ...props.scopes.map((s) => SCOPE[s])].join(", ")]
      ]}
    />
    <Action href={props.url}>Uitnodiging bekijken</Action>
    <Note>
      Je ziet alleen de bestellingen die bij jou liggen. De uitnodiging werkt tot {day(props.expiresAt)}{" "}
      en alleen voor dit e-mailadres.
    </Note>
  </Letter>
)

export const preview = (urls: Urls): SupplierInviteProps => ({
  url: urls.console("/invitations/inv_voorbeeld?k=voorbeeld"),
  brand: "Northwind",
  inviter: "Elena Hart",
  scopes: ["stock", "statements", "chat"],
  expiresAt: new Date("2026-11-16T12:00:00Z")
})

SupplierInvite.PreviewProps = preview(PREVIEW)

export default SupplierInvite
