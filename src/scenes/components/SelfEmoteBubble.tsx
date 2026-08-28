import { usePresenceStore } from '../../store/usePresenceStore'
import { EmoteBubble } from './EmoteBubble'

/*
 * The local echo: this player's own last emote, over their own head.
 *
 * The room broadcasts an emote to everyone but its sender, so without this a
 * pressed emote is a button that visibly does nothing on the sender's own
 * screen — indistinguishable from a bug, which is exactly how it was reported.
 *
 * A component rather than an inline read because the local figure is drawn in
 * five places — `WalkingPlayer` and each scene's seated pose — and every one
 * of them should carry the bubble with a single line. Renders nothing outside
 * multiplayer: `selfEmote` is only ever set by a send that actually went out.
 */
export function SelfEmoteBubble() {
  const selfEmote = usePresenceStore((state) => state.selfEmote)

  if (!selfEmote) return null
  return <EmoteBubble emote={selfEmote.emote} at={selfEmote.at} />
}
