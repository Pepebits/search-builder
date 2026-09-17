/**
 * Hues an avatar can take, chosen so no two neighbours look alike and none
 * lands on the red that reads as an error. Lightness and chroma come from the
 * theme tokens; only the hue is per person.
 */
export const TONE_HUES = [160, 200, 240, 285, 330, 55, 110]

/** A stable hue for a person, from anything that identifies them. */
export function toneHue (seed: unknown): number {
  let hash = 0
  for (const char of String(seed ?? '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TONE_HUES[hash % TONE_HUES.length]
}
