/**
 * The limiter's key for an address: an IPv6 address by its /64, which one host or tenant usually holds whole, written
 * the same however the address was (`2001:db8::1` and `2001:db8:0:0:1::2` are one /64). IPv4 as it came.
 */
export const ipKey = (ip: string) => {
  if (!ip.includes(":")) return `ip:${ip}`
  const [head = "", tail = ""] = ip.split("::")
  const left = head === "" ? [] : head.split(":")
  const right = tail === "" ? [] : tail.split(":")
  const groups = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left
  return `ip6:${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`
}
