import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Sprite } from 'three'
import { getEmoteTexture } from '../emoteTexture'
import { EMOTE_TTL_MS, type EmoteId } from '../../world/emotes'

/*
 * What a player just said, floating over the nameplate.
 *
 * A `<sprite>` on the nameplate's rules: it billboards for free, and it is
 * drawn over whatever it overlaps because a callout half-buried in a slot
 * machine is worse than one floating slightly in front.
 *
 * Expiry is derived per frame from the arrival stamp rather than scheduled:
 * no timer to cancel when a second emote replaces the first, and nothing to
 * leak when the peer leaves mid-bubble. The store keeps the last emote
 * forever; this component simply stops showing it.
 */

/** Above the nameplate, which sits at 2.10 — see `Nameplate.tsx`. */
const BUBBLE_Y = 2.42

/**
 * Width in world units. A touch wider than the nameplate's 1.1: the label is
 * a phrase, not a name, and it is the transient of the two.
 */
const WIDTH = 1.25
const ASPECT = 128 / 512

interface EmoteBubbleProps {
  /** An already-sanitized emote id. */
  emote: EmoteId
  /** `performance.now()` when it arrived, from the presence store. */
  at: number
}

export function EmoteBubble({ emote, at }: EmoteBubbleProps) {
  const spriteRef = useRef<Sprite>(null)
  const texture = useMemo(() => getEmoteTexture(emote), [emote])

  useFrame(() => {
    const sprite = spriteRef.current
    if (sprite) sprite.visible = performance.now() - at < EMOTE_TTL_MS
  })

  return (
    <sprite
      ref={spriteRef}
      position={[0, BUBBLE_Y, 0]}
      scale={[WIDTH, WIDTH * ASPECT, 1]}
      // Born hidden so an expired stamp never flashes for the frame before
      // `useFrame` first runs.
      visible={false}
    >
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
    </sprite>
  )
}
