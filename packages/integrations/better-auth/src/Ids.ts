/**
 * A TypeID for better-auth's rows, in the format `@insyte/domain/Ids` checks: the prefix, `_`, and a UUIDv7 in 26
 * Crockford base32 characters, so ids sort by creation (domain.md §1).
 */
const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"

const uuidv7 = (): Uint8Array => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const ms = Date.now()
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  return bytes
}

/** 128 bits as 26 base32 characters, the first holding the top 3 bits (TypeID's encoding). */
const base32 = (bytes: Uint8Array): string => {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  let out = ""
  for (let i = 0; i < 26; i++) {
    out = CROCKFORD[Number(value & 31n)] + out
    value >>= 5n
  }
  return out
}

export const typeId = (prefix: string): string => `${prefix}_${base32(uuidv7())}`
