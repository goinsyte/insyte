/** JSON with comments and trailing commas (wrangler.jsonc), parsed without a dependency. String-aware: `//` in a URL stays. */
export const parseJsonc = (text: string): unknown => {
  let out = ""
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === "\"") {
      const start = i
      i++
      while (i < text.length && text[i] !== "\"") i += text[i] === "\\" ? 2 : 1
      out += text.slice(start, ++i)
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 2
    } else {
      out += c
      i++
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"))
}
