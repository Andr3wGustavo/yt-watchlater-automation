import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider, VideoMetadata, SynthesisResult } from '../../types/index.js';
import { createChildLogger } from '../../utils/logger.js';
import { getSynthesisPrompt, getShortsSynthesisPrompt } from './prompts.js';

const log = createChildLogger('gemini');

const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Implementação do LLMProvider para Google Gemini 2.5 Flash.
 */
export function createGeminiProvider(apiKey: string): LLMProvider {
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    },
  });

  return {
    name: 'gemini',
    model: MODEL_NAME,

    async summarize(transcript: string, metadata: VideoMetadata): Promise<SynthesisResult> {
      log.info({ youtubeId: metadata.youtubeId, transcriptLength: transcript.length, isShort: !!metadata.isShort }, 'Enviando ao Gemini...');

      // Selecionar prompt baseado no tipo de vídeo
      const prompt = metadata.isShort
        ? getShortsSynthesisPrompt(transcript, metadata)
        : getSynthesisPrompt(transcript, metadata);

      try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const markdown = response.text();

        // Extrair contagem de tokens (se disponível)
        const usage = response.usageMetadata;
        const tokensUsed = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

        log.info({ youtubeId: metadata.youtubeId, tokensUsed }, 'Resposta do Gemini recebida');

        return {
          markdown,
          tokensUsed,
          model: MODEL_NAME,
        };
      } catch (error: any) {
        log.error({ youtubeId: metadata.youtubeId, err: error.message }, 'Erro no Gemini');
        throw new Error(`Falha no Gemini: ${error.message}`);
      }
    },
  };
}
