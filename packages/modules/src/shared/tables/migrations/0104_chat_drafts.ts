import { statements } from "../statements.ts"

/*
 * The customer agent's chat drafts in the inbox (follow-up to M15 step 8): on Eerst vragen or Alleen concepten the
 * agent writes its answer as a draft (`drafts`, subject `chat`), and the chat's letter shows it with Versturen,
 * Aanpassen and Weggooien. "Versturen" and "Aanpassen" mark it used (`used_at`, as "Concept gebruiken" does for mail);
 * "Weggooien" marks it `discarded_at`, which its Undo clears. A draft is never deleted (0074): the counts and the
 * erasure read them all.
 */
export default statements("alter table drafts add column discarded_at timestamptz")
