/*
 * A session's device as Beveiliging names it (M3.3): "Mac · Chrome", "iPhone · Safari". Read from the user agent the
 * session was opened with; a browser does not say which model it runs on, so the system stands in for it.
 */

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "Chromebook"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"]
]

// Order matters: Edge and Opera say Chrome too, Chrome says Safari, and a browser on iOS says Safari whatever it is.
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"]
]

const first = (table: ReadonlyArray<readonly [RegExp, string]>, text: string) =>
  table.find(([pattern]) => pattern.test(text))?.[1]

/** "Mac · Chrome"; one half alone when the other is unknown; "Onbekend apparaat" when neither is. */
export const deviceOf = (userAgent: string | null): string => {
  const parts = [first(SYSTEMS, userAgent ?? ""), first(BROWSERS, userAgent ?? "")].filter((p) => p !== undefined)
  return parts.length === 0 ? "Onbekend apparaat" : parts.join(" · ")
}
