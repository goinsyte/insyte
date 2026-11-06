import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * shadcn's class merger: conditional classes in, with later Tailwind utilities winning over earlier
 * ones in the same group.
 *
 * The custom palette needs no `extendTailwindMerge` configuration, because tailwind-merge classifies
 * colour utilities by prefix rather than by value — `bg-glacier` is a background colour to it for the
 * same reason `bg-red-500` is. Radius is the case that would have needed configuring, and does not:
 * the tokens render one ladder onto Tailwind's own `sm`/`md`/`lg`/`xl` names rather than adding
 * `rounded-control` beside them.
 */
export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}
