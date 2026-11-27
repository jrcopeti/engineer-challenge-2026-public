import { createFakeSummarizer } from './fake'
import { createAnthropicSummarizer } from './anthropic'

import type { Summarizer } from './summarizer'

export { SummarizerError, type Summarizer } from './summarizer'

export type LlmProvider = 'fake' | 'anthropic'

export type SummarizerConfig = {
  provider: LlmProvider
  anthropicApiKey?: string
  anthropicModel: string
}

export function createSummarizer(config: SummarizerConfig): Summarizer {
  switch (config.provider) {
    case 'fake':
      return createFakeSummarizer()
    case 'anthropic':
      if (!config.anthropicApiKey) {
        throw new Error('LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY')
      }
      return createAnthropicSummarizer(config.anthropicApiKey, config.anthropicModel)
  }
}
