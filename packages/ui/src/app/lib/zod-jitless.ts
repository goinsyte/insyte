import { z } from "zod"

/*
 * zod picks its fast parser by probing `new Function("")` once. Under the console's Content-Security-Policy (no
 * `'unsafe-eval'`) that probe fails, as it should, but the browser reports it as a policy violation on every page.
 * Asking for the plain parser up front skips the probe; the console's forms parse a handful of fields, so speed is not
 * the question. A host calls it before any schema parses.
 */
export const parseWithoutEval = () => z.config({ jitless: true })
