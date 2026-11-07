/**
 * The Dutch sentence for an error a screen shows (12 §5, 05 §2.4). Written for this repo.
 *
 * better-auth answers `/api/auth/*` with `{ code, message }`, and its messages are English and written for a
 * developer. The console's client passes every error through `authErrorCopy`, so a screen only ever reads a sentence a
 * person can act on. A code missing here falls back to the screen's own line; it never shows better-auth's message.
 * The RPC error tags join this file when the first slice's forms do (05 §2.4).
 */

const AUTH: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Dit e-mailadres en wachtwoord horen niet bij elkaar.",
  EMAIL_NOT_VERIFIED: "Bevestig eerst je e-mailadres via de link in je mail. Geen mail gehad? Kijk in je spam.",
  INVALID_EMAIL: "Vul een geldig e-mailadres in.",
  PASSWORD_TOO_SHORT: "Kies een wachtwoord van minimaal 8 tekens.",
  PASSWORD_TOO_LONG: "Dit wachtwoord is te lang. Houd het onder de 128 tekens.",
  INVALID_TOKEN: "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.",
  TOKEN_EXPIRED: "Deze link is verlopen. Vraag een nieuwe aan.",
  EMAIL_ALREADY_VERIFIED: "Je e-mailadres is al bevestigd. Je kunt inloggen.",
  TOO_MANY_REQUESTS: "Te veel pogingen. Wacht even en probeer het opnieuw.",
  NOT_YET_AVAILABLE: "Dit deel van Insyte is nog niet beschikbaar."
}

/** The sentence for a better-auth error code, or `fallback` for a code this file does not know. */
export const authErrorCopy = (code: string | undefined, fallback: string): string =>
  (code !== undefined ? AUTH[code] : undefined) ?? fallback
