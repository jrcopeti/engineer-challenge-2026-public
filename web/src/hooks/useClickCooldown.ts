import { useRef } from 'react'

const DEFAULT_COOLDOWN_MS = 500

/**
 * Drop repeat clicks on the same target within a short window, so a double-click on a
 * toggle (Resolve → Reopen) does not undo itself.
 *
 * A time window rather than an "in flight" flag: on a fast network the first request
 * finishes between the two clicks of a double-click, so "in flight" would not catch it.
 * After the window the label has already flipped, so a further click is deliberate.
 *
 * Returns `true` when the click should proceed.
 */
export function useClickCooldown(cooldownMs = DEFAULT_COOLDOWN_MS) {
  const lastClick = useRef(new Map<number | string, number>())

  return (key: number | string): boolean => {
    const now = Date.now()
    if (now - (lastClick.current.get(key) ?? 0) < cooldownMs) return false
    lastClick.current.set(key, now)
    return true
  }
}
