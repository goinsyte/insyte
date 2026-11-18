/*
 * A Worker's app, loaded on the first request an isolate serves and not when the script starts (ADR-0041 §3).
 * Cloudflare refuses a script whose startup takes more than 1 s of CPU, and measures it on validator machines several
 * times slower than CI; a request has 30 s. The entry module imports nothing but this, so the app's modules are
 * evaluated, and its layer built, inside the first request, which the startup used to precede anyway. Requests that
 * arrive while it loads wait for the same load; a load that fails fails those requests, and the next one tries again.
 *
 * No imports: this module is part of the entry's startup graph, where `startup:check` fails on effect or a workspace
 * package (`HEAVY_AT_STARTUP`, `scripts/lib/startup-rules.ts`).
 */
export const onFirstRequest = <A>(load: () => Promise<A>): () => Promise<A> => {
  let loading: Promise<A> | undefined
  return () =>
    loading ??= load().catch((error: unknown) => {
      loading = undefined
      throw error
    })
}
