import type { Summarizer } from './summarizer'

/**
 * Deterministic stand-in for offline development and tests. Echoes enough of the
 * input that a test can tell the message actually reached the summarizer.
 */
export function createFakeSummarizer(): Summarizer {
  return {
    async summarize(message) {
      const firstSentence = message.split(/(?<=[.!?])\s/)[0].slice(0, 120)
      return `Customer wrote: "${firstSentence}" Follow-up from support is pending.`
    },
  }
}
