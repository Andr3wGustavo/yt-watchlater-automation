import OpenAI from 'openai';
import type { LLMProvider, VideoMetadata, SynthesisResult } from '../../types/index.js';
import { createChildLogger } from '../../utils/logger.js';
import { getSynthesisPrompt, getShortsSynthesisPrompt } from './prompts.js';

const log = createChildLogger('openai');

const MODEL_NAME = 'gpt-4o';

/**
 * Implementação do LLMProvider para OpenAI GPT-4o.
 */
export function createOpenAIProvider(apiKey: string): LLMProvider {
  const client = new OpenAI({ apiKey });

  return {
    name: 'openai',
    model: MODEL_NAME,

    async summarize(transcript: string, metadata: VideoMetadata): Promise<SynthesisResult> {
      log.info({ youtubeId: metadata.youtubeId, transcriptLength: transcript.length, isShort: !!metadata.isShort }, 'Enviando ao OpenAI...');

      // Selecionar prompt baseado no tipo de vídeo
      const prompt = metadata.isShort
        ? getShortsSynthesisPrompt(transcript, metadata)
        : getSynthesisPrompt(transcript, metadata);

      try {
        const response = await client.chat.completions.create({
          model: MODEL_NAME,
          temperature: 0.4,
          max_tokens: 8192,
          messages: [
            {
              role: 'system',
              content: 'Você é um assistente especializado em sintetizar conhecimento de vídeos em documentos Markdown estruturados. Siga as instruções do usuário à risca.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        });

        const markdown = response.choices[0]?.message?.content || '';
        const tokensUsed = response.usage?.total_tokens || 0;

        log.info({ youtubeId: metadata.youtubeId, tokensUsed }, 'Resposta do OpenAI recebida');

        return {
          markdown,
          tokensUsed,
          model: MODEL_NAME,
        };
      } catch (error: any) {
        log.error({ youtubeId: metadata.youtubeId, err: error.message }, 'Erro no OpenAI');
        throw new Error(`Falha no OpenAI: ${error.message}`);
      }
    },
  };
}
