/**
 * Why a shopper's erasure did not finish, in words for Je gegevens (0106): the columns that held the shopper and take
 * no placeholder (`tabel.kolom`, comma-separated), or `unexpected`. It is tried again every hour.
 */
export const erasureStuck = (error: string) => {
  if (error === "unexpected") return "Verwijderen lukt niet, we proberen het elk uur opnieuw"
  const columns = error.split(",").map((c) => c.trim()).filter((c) => c !== "")
  return columns.length === 1
    ? `Verwijderen lukt niet: kolom ${columns[0]} past niet`
    : `Verwijderen lukt niet: kolommen ${columns.join(", ")} passen niet`
}
