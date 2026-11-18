/** An IPv6 address as its eight groups, `::` expanded and a dotted IPv4 tail (`::ffff:192.0.2.1`) as two groups. */
const groupsOf = (ip: string): ReadonlyArray<number> => {
  let text = ip.toLowerCase()
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text)
  if (v4 !== null) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number]
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head = "", tail = ""] = text.split("::")
  const left = head === "" ? [] : head.split(":")
  const right = tail === "" ? [] : tail.split(":")
  const groups = text.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left
  return groups.map((g) => Number.parseInt(g, 16) || 0)
}

/**
 * The limiter's key for an address: an IPv6 address by its /64, which one host or tenant usually holds whole, written
 * the same however the address was (`2001:db8::1` and `2001:db8:0:0:1::2` are one /64). IPv4 as it came, and so is
 * an IPv4 address mapped into IPv6 (`::ffff:192.0.2.1` is `192.0.2.1`, not a /64 of its own).
 */
export const ipKey = (ip: string) => {
  if (!ip.includes(":")) return `ip:${ip}`
  const groups = groupsOf(ip)
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [hi = 0, lo = 0] = groups.slice(6)
    return `ip:${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  return `ip6:${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`
}
