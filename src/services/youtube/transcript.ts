import { fetchTranscript } from 'youtube-transcript';
import { createChildLogger } from '../../utils/logger.js';
import { prisma } from '../../db/client.js';
import type { TranscriptResult } from '../../types/index.js';

const log = createChildLogger('transcript');

/**
 * Idiomas para tentar extrair a transcrição, em ordem de preferência.
 */
const LANGUAGE_PRIORITY = ['pt', 'pt-BR', 'en', 'es'];

/**
 * Extrai a transcrição de um vídeo do YouTube.
 * Tenta múltiplos idiomas em ordem de preferência.
 * Salva o texto bruto no banco para re-processamento futuro.
 */
export async function extractTranscript(youtubeId: string): Promise<TranscriptResult> {
  log.info({ youtubeId }, 'Extraindo transcrição...');

  let lastError: Error | null = null;

  // Tentar cada idioma na ordem de prioridade
  for (const lang of LANGUAGE_PRIORITY) {
    try {
      const segments = await fetchTranscript(youtubeId, { lang });

      const transcriptSegments = segments.map((seg: any) => ({
        text: seg.text,
        offset: Math.round((seg.offset || 0) * 1000),
        duration: Math.round((seg.duration || 0) * 1000),
      }));

      const fullText = transcriptSegments
        .map((s) => s.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      log.info({ youtubeId, lang, length: fullText.length }, 'Transcrição extraída com sucesso');

      return {
        text: fullText,
        language: lang,
        segments: transcriptSegments,
      };
    } catch (err: any) {
      lastError = err;
      log.debug({ youtubeId, lang, err: err.message }, 'Idioma não disponível, tentando próximo...');
    }
  }

  // Tentar sem especificar idioma (auto-generated)
  try {
    log.debug({ youtubeId }, 'Tentando transcrição auto-gerada...');
    const segments = await fetchTranscript(youtubeId);

    const transcriptSegments = segments.map((seg: any) => ({
      text: seg.text,
      offset: Math.round((seg.offset || 0) * 1000),
      duration: Math.round((seg.duration || 0) * 1000),
    }));

    const fullText = transcriptSegments
      .map((s) => s.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    log.info({ youtubeId, lang: 'auto', length: fullText.length }, 'Transcrição auto-gerada extraída');

    return {
      text: fullText,
      language: 'auto',
      segments: transcriptSegments,
    };
  } catch (err: any) {
    lastError = err;
  }

  log.error({ youtubeId, err: lastError?.message }, 'Falha ao extrair transcrição em qualquer idioma');
  throw new Error(`Não foi possível extrair a transcrição do vídeo ${youtubeId}: ${lastError?.message}`);
}

/**
 * Extrai a transcrição e salva no banco de dados.
 */
export async function extractAndSaveTranscript(videoDbId: string, youtubeId: string): Promise<TranscriptResult> {
  const startTime = Date.now();
  
  try {
    const result = await extractTranscript(youtubeId);

    // Salvar transcrição bruta no banco para re-processamento futuro
    await prisma.video.update({
      where: { id: videoDbId },
      data: { transcriptRaw: result.text },
    });

    // Log de auditoria
    await prisma.processingLog.create({
      data: {
        videoId: videoDbId,
        action: 'transcript',
        success: true,
        durationMs: Date.now() - startTime,
        metadata: JSON.stringify({ language: result.language, length: result.text.length }),
      },
    });

    return result;
  } catch (error: any) {
    // Log de falha
    await prisma.processingLog.create({
      data: {
        videoId: videoDbId,
        action: 'transcript',
        success: false,
        durationMs: Date.now() - startTime,
        metadata: JSON.stringify({ error: error.message }),
      },
    });

    throw error;
  }
}
