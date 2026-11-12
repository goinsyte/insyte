import { describe, expect, it } from "vitest"
import { deviceOf } from "../src/Devices.ts"

describe("deviceOf", () => {
  it.each([
    [
      "Chrome on a Mac",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Mac · Chrome"
    ],
    [
      "Safari on an iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      "iPhone · Safari"
    ],
    [
      "Chrome on an iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
      "iPhone · Chrome"
    ],
    ["Firefox on Linux", "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0", "Linux · Firefox"],
    [
      "Edge on Windows",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68",
      "Windows · Edge"
    ],
    [
      "Chrome on Android",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      "Android · Chrome"
    ]
  ])("names %s", (_, userAgent, device) => {
    expect(deviceOf(userAgent)).toBe(device)
  })

  it("says what it can, and that it does not know when it knows nothing", () => {
    expect(deviceOf("curl/8.7.1")).toBe("Onbekend apparaat")
    expect(deviceOf(null)).toBe("Onbekend apparaat")
    expect(deviceOf("Mozilla/5.0 (Windows NT 10.0) SomeBrowser/1.0")).toBe("Windows")
  })
})
