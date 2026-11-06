"use client"

import { cn } from "@insyte/ui/lib/utils"
import type * as React from "react"

/*
 * The queue, which is the surface the operator actually lives in.
 *
 * Rows are separated by one hairline — the one place this system draws a line, because a table IS a
 * data boundary — and selection is a FLOOD, not a ring and not a left border: the row takes the
 * plate colour and its ink becomes the ink for a dark ground. That is the whole reason `arc` pairs
 * with `mesh-ink` in the tokens.
 *
 * Every cell is tabular by default, from `app.css`, so a column of amounts and order numbers lines
 * up without a second typeface.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead data-slot="table-header" className={cn("[&_tr]:border-hairline [&_tr]:border-b", className)} {...props} />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-hairline border-t bg-mist font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-hairline border-b transition-colors duration-[80ms]",
        "hover:bg-ink/4 has-aria-expanded:bg-ink/4",
        "data-[state=selected]:flood data-[state=selected]:[&_*]:text-mesh-ink",
        className
      )}
      {...props}
    />
  )
}

/* Column labels: sentence case, mid-emphasis, never uppercase and never a second face. */
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 whitespace-nowrap px-3 text-left align-middle font-medium text-ink-3 text-xs",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "whitespace-nowrap px-3 py-2.5 align-middle text-ink",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-4 text-ink-3 text-sm", className)} {...props} />
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow }
