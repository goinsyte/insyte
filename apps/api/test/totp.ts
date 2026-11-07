/** RFC 6238 codes for the tests, from an `otpauth://` URI's base32 secret: what an authenticator app shows. */
const base32 = (text: string): Uint8Array => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = ""
  for (const char of text.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0")
  const bytes = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  return bytes
}

export const secretOf = (totpURI: string) => new URL(totpURI).searchParams.get("secret") ?? ""

export const totp = async (secret: string, at = Date.now(), period = 30, digits = 6): Promise<string> => {
  const counter = new DataView(new ArrayBuffer(8))
  counter.setBigUint64(0, BigInt(Math.floor(at / 1000 / period)))
  const key = await crypto.subtle.importKey("raw", base32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter.buffer))
  const offset = mac[mac.length - 1]! & 0x0f
  const value = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!
  return String(value % 10 ** digits).padStart(digits, "0")
}
