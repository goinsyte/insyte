import { statements } from "../statements.ts"

/*
 * Mail the shopper from anywhere (M7 9.1 `Orders.emailCustomer`, M8 10.2a `Forwarding.customerDraft`): `order_mails`
 * holds every mail the team sends a shopper about one order, not only the delay mail (M10.2).
 *
 * - `kind` gains `tracking` ("Track & trace-update sturen": the parcel's carrier and number) and `message` (the team's
 *   own words: forwarding's "Klant mailen", `/v1`, an automation's `send_email`).
 * - `ref`: what one mail of a kind is about, where a kind goes more than once. A tracking mail's is the tracking number
 *   it told, so a selection sent twice tells each parcel once, and a new parcel is told again.
 * - `order_mails_once` keeps the delay mail once per order; `order_mails_tracking_once` a tracking mail once per parcel.
 *   A message goes as often as the team writes one; the caller's id (`oml_…`) makes asking twice send it once.
 */
export default statements(
  "alter table order_mails drop constraint order_mails_kind_check",
  "alter table order_mails add constraint order_mails_kind_check check (kind in ('delay', 'tracking', 'message'))",
  "alter table order_mails add column ref text",
  "alter table order_mails add constraint order_mails_ref check ((kind = 'tracking') = (ref is not null))",
  "drop index order_mails_once",
  "create unique index order_mails_once on order_mails (order_id) where kind = 'delay' and state in ('scheduled', 'sent')",
  `create unique index order_mails_tracking_once on order_mails (order_id, ref)
     where kind = 'tracking' and state in ('scheduled', 'sent')`
)
