import type { LLMProvider } from '../../types/index.js';
import { getConfig } from '../../config/env.js';
import { createChildLogger } from '../../utils/logger.js';
import { createGeminiProvider } from './gemini.js';
import { createOpenAIProvider } from './openai.js';

const log = createChildLogger('llm-provider');

/**
 * Factory que cria o provider de LLM baseado na configuração.
 * Strategy Pattern: troca Gemini ↔ OpenAI com 1 env var.
 */
export function createLLMProvider(): LLMProvider {
  const config = getConfig();

  switch (config.LLM_PROVIDER) {
    case 'gemini':
      log.info('Inicializando LLM provider: Gemini');
      return createGeminiProvider(config.GEMINI_API_KEY);

    case 'openai':
      log.info('Inicializando LLM provider: OpenAI');
      return createOpenAIProvider(config.OPENAI_API_KEY);

    default:
      throw new Error(`LLM provider desconhecido: ${config.LLM_PROVIDER}`);
  }
}
