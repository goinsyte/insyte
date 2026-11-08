/** "3 orders" / "1 order". */
export function counted(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}
