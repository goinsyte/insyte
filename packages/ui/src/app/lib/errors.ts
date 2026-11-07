/**
 * The Dutch sentence for an error a screen shows (12 §5, 05 §2.4). Written for this repo.
 *
 * better-auth answers `/api/auth/*` with `{ code, message }`, and its messages are English and written for a
 * developer. The console's client passes every error through `authErrorCopy`, so a screen only ever reads a sentence a
 * person can act on. A code missing here falls back to the screen's own line; it never shows better-auth's message.
 * The RPC error tags join this file when the first slice's forms do (05 §2.4).
 */

const AUTH: Record<string, string> = {
  // One sentence for an unknown address and a wrong password alike: sign-in never says which addresses exist (M2.3).
  INVALID_EMAIL_OR_PASSWORD: "E-mailadres of wachtwoord klopt niet.",
  EMAIL_NOT_VERIFIED: "Bevestig eerst je e-mailadres via de link in je mail. Geen mail gehad? Kijk in je spam.",
  INVALID_EMAIL: "Vul een geldig e-mailadres in.",
  PASSWORD_TOO_SHORT: "Kies een wachtwoord van minimaal 8 tekens.",
  PASSWORD_TOO_LONG: "Dit wachtwoord is te lang. Houd het onder de 128 tekens.",
  INVALID_TOKEN: "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.",
  TOKEN_EXPIRED: "Deze link is verlopen. Vraag een nieuwe aan.",
  EMAIL_ALREADY_VERIFIED: "Je e-mailadres is al bevestigd. Je kunt inloggen.",
  PASSWORD_BREACHED: "Dit wachtwoord komt voor in bekende datalekken. Kies een ander.",
  RATE_LIMITED: "Te veel pogingen. Wacht even en probeer het opnieuw.",
  TURNSTILE_REQUIRED: "Bevestig even dat je een mens bent en probeer het opnieuw.",
  INVALID_CODE: "Deze code klopt niet. Controleer de tijd op je telefoon en probeer de volgende code.",
  INVALID_BACKUP_CODE: "Deze back-upcode klopt niet of is al gebruikt.",
  INVALID_TWO_FACTOR_COOKIE: "Je inlogpoging is verlopen. Log opnieuw in.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Te veel foute codes. Log opnieuw in.",
  ACCOUNT_TEMPORARILY_LOCKED: "Te veel foute codes. Je account is een kwartier geblokkeerd.",
  // Google's round trip, as better-auth names its failures on the way back (`?error=` on the sign-in screen).
  access_denied: "Je hebt het inloggen met Google afgebroken.",
  email_not_verified: "Dit Google-account heeft geen bevestigd e-mailadres.",
  account_already_linked_to_different_user: "Dit Google-account hoort al bij een ander Insyte-account.",
  unable_to_link_account: "Dit Google-account kon niet aan je account worden gekoppeld.",
  oauth_provider_not_found: "Inloggen met Google is hier niet beschikbaar. Log in met je e-mailadres.",
  PROVIDER_NOT_FOUND: "Inloggen met Google is hier niet beschikbaar. Log in met je e-mailadres.",
  BETA_CLOSED: "Insyte is nog alleen op uitnodiging. Laat je e-mailadres achter, dan laten we het je weten.",
  NOT_YET_AVAILABLE: "Dit deel van Insyte is nog niet beschikbaar."
}

/** How long to wait, as the sentence says it: "1 minuut", "15 minuten". Rounded up, so the wait is never short. */
const minutes = (seconds: number) => {
  const n = Math.max(1, Math.ceil(seconds / 60))
  return n === 1 ? "1 minuut" : `${n} minuten`
}

/**
 * The sentence for a better-auth error code, or `fallback` for a code this file does not know. A rate limit names its
 * wait when the server sent one (`retryAfterSeconds`, the edge guards' refusal).
 */
export const authErrorCopy = (code: string | undefined, fallback: string, retryAfterSeconds?: number): string => {
  if (code === "RATE_LIMITED" && retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    return `Te veel pogingen. Probeer het over ${minutes(retryAfterSeconds)} opnieuw.`
  }
  return (code !== undefined ? AUTH[code] : undefined) ?? fallback
}
