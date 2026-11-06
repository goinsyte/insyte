import type { ReactNode } from "react"

/**
 * The public demo is linked from portfolios, so it must not offer a working
 * address. Real addresses and mail CTAs only render with VITE_SHOW_CONTACT=on,
 * and the domain comes from VITE_CONTACT_DOMAIN so no real address is in the
 * bundle otherwise. Off, an address reads as an inert sample on .example.
 */
export const SHOW_CONTACT = import.meta.env.VITE_SHOW_CONTACT === "on"

const CONTACT_DOMAIN: string = (SHOW_CONTACT && import.meta.env.VITE_CONTACT_DOMAIN) || "insyte.example"

export const contactAddress = (name: string) => `${name}@${CONTACT_DOMAIN}`

export const mailtoHref = (name: string, subject?: string) =>
  `mailto:${contactAddress(name)}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`

export function ContactEmail({
  name,
  className,
  children
}: {
  name: string
  className?: string
  children?: ReactNode
}) {
  if (SHOW_CONTACT) {
    return (
      <a href={mailtoHref(name)} className={className}>
        {children ?? contactAddress(name)}
      </a>
    )
  }
  return <span className={className}>{children ?? contactAddress(name)}</span>
}
