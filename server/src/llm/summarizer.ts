/** Everything the app needs from an LLM. One method, so a provider is ~30 lines. */
export interface Summarizer {
  /** Summarise one customer message for a support agent. Throws SummarizerError on failure. */
  summarize(message: string): Promise<string>
}

/** Provider failed (network, auth, rate limit, timeout). Message is safe to show a user. */
export class SummarizerError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
  }
}
