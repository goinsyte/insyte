import { AlertTriangle, CheckCircle2, InfoIcon, Loader, OctagonXIcon } from "@insyte/ui/icons"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      /* `ToasterProps["theme"]` is an OPTIONAL prop, so under `exactOptionalPropertyTypes` that
         indexed type carries `undefined` and the cast put it straight back after the default
         above had removed it. The non-nullable form says what the destructuring already did. */
      theme={theme as NonNullable<ToasterProps["theme"]>}
      className="toaster group"
      /* Bottom centre, not the bottom-right corner: that corner is where the plate keeps its File
         button, and a toast saying "filed" sat on top of the button that filed it. The action is the
         brand's primary button, because Undo is the one thing in a toast worth pressing. */
      toastOptions={{
        classNames: {
          actionButton: "!bg-abyss !text-mesh-ink !rounded-md !font-medium !h-7 !px-2.5 hover:!bg-abyss-2",
          description: "!text-ink-2"
        }
      }}
      icons={{
        success: <CheckCircle2 className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <AlertTriangle className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader className="size-4 animate-spin" />
      }}
      style={{
        "--normal-bg": "var(--paper)",
        "--normal-text": "var(--ink)",
        // A toast is a raised panel, so its edge is the shadow and not a line.
        "--normal-border": "transparent",
        "--border-radius": "var(--radius-lg)",
        "--success-bg": "var(--signal-green-bg)",
        "--success-text": "var(--signal-green)",
        "--success-border": "transparent",
        "--warning-bg": "var(--signal-amber-bg)",
        "--warning-text": "var(--signal-amber)",
        "--warning-border": "transparent",
        "--error-bg": "var(--signal-red-bg)",
        "--error-text": "var(--signal-red)",
        "--error-border": "transparent"
      } as React.CSSProperties}
      {...props}
    />
  )
}

export { Toaster }
