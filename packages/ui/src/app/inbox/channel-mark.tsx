import { MessageCircle } from "../../icons"
import { CHANNEL_LABEL, type ChannelId } from "../lib/channels"
import { BrandLogo } from "../marketplace/brand-logos"

/** A messaging channel's mark: its brand logo, or the website chat's bubble on the plate colour. */
export function ChannelMark({ channel, size = 16 }: { channel: Exclude<ChannelId, "email">; size?: number }) {
  if (channel === "webchat") {
    return (
      <span
        title="Websitechat"
        aria-label="Websitechat"
        className="inline-flex shrink-0 items-center justify-center rounded-[5px] bg-abyss text-mesh-ink"
        style={{ width: size, height: size }}
      >
        <MessageCircle style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={1.75} />
      </span>
    )
  }
  return <BrandLogo brand={channel} name={CHANNEL_LABEL[channel]} size={size} />
}
