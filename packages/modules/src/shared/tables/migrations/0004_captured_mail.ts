import { statements } from "../statements.ts"

/**
 * Mail the memory adapter "sent": local, the worker tests and previews read it back instead of an inbox
 * (`/api/__dev/mail`, refused in production). Staging and production send through Resend and never write here.
 */
export default statements(
  `create table captured_mail (
     id         bigint generated always as identity primary key,
     kind       text not null,
     to_address text not null,
     url        text,
     sent_at    timestamptz not null default now()
   )`,
  "create index captured_mail_to on captured_mail (to_address, sent_at desc)"
)
