import { prisma } from '../../db/client.js';
import { extractAndSaveTranscript } from '../youtube/transcript.js';
import { removeAndMarkVideo } from '../youtube/video-remover.js';
import { createLLMProvider } from '../llm/provider.js';
import { getSynthesisPrompt, getShortsSynthesisPrompt } from '../llm/prompts.js';
import { saveMarkdown } from '../synthesis/markdown-builder.js';
import { formatDuration, extractVideoId } from '../../utils/helpers.js';
import { classifyVideoType } from '../youtube/liked-reader.js';
import { notifyWhatsApp } from '../whatsapp/sender.js';
import { createChildLogger } from '../../utils/logger.js';
import type { PipelineResult, PipelineStepResult, VideoMetadata, LLMProvider as ILLMProvider } from '../../types/index.js';

const log = createChildLogger('pipeline');

let llmProvider: ILLMProvider | null = null;

function getLLMProvider(): ILLMProvider {
  if (!llmProvider) {
    llmProvider = createLLMProvider();
  }
  return llmProvider;
}

/**
 * Processa um vídeo a partir de uma URL/ID do YouTube sob demanda (sem fila).
 * Usado para comandos via WhatsApp de links diretos.
 */
export async function processDirectUrl(url: string): Promise<PipelineResult> {
  const youtubeId = extractVideoId(url) || url;

  let video = await prisma.video.findUnique({ where: { youtubeId } });

  if (!video) {
    video = await prisma.video.create({
      data: {
        youtubeId,
        title: 'URL Direta',
        channelName: 'Desconhecido',
        url: `https://www.youtube.com/watch?v=${youtubeId}`,
        status: 'pending',
        source: 'direct',
      },
    });
  } else if (video.status === 'done') {
    // Se já processou antes, a gente re-processa ou apenas devolve o sucesso?
    // Vamos setar pra pending de novo pra forçar o reprocessamento se for link direto
    await prisma.video.update({
      where: { id: video.id },
      data: { status: 'pending' }
    });
  }

  return processVideoFromDb(video.id);
}

/**
 * Processa um vídeo a partir de uma URL/ID do YouTube.
 * Cria ou busca o registro no banco e executa o pipeline completo.
 */
export async function processVideo(youtubeIdOrUrl: string): Promise<PipelineResult> {
  const youtubeId = extractVideoId(youtubeIdOrUrl) || youtubeIdOrUrl;

  // Buscar ou criar registro no banco
  let video = await prisma.video.findUnique({ where: { youtubeId } });

  if (!video) {
    // Criar registro mínimo (será enriquecido durante o processamento)
    video = await prisma.video.create({
      data: {
        youtubeId,
        title: 'Processando...',
        channelName: 'Desconhecido',
        url: `https://www.youtube.com/watch?v=${youtubeId}`,
        status: 'pending',
      },
    });
  }

  return processVideoFromDb(video.id);
}

/**
 * Processa um vídeo que já existe no banco de dados.
 * Pipeline: transcrição → LLM → .md → remoção da WL
 */
export async function processVideoFromDb(videoDbId: string): Promise<PipelineResult> {
  const video = await prisma.video.findUnique({ where: { id: videoDbId } });

  if (!video) {
    throw new Error(`Vídeo não encontrado no banco: ${videoDbId}`);
  }

  log.info({ youtubeId: video.youtubeId, title: video.title }, '🚀 Iniciando pipeline');

  const steps: PipelineStepResult[] = [];

  // Classificar tipo de vídeo e marcar como processing
  const videoType = classifyVideoType(video.duration);
  await prisma.video.update({
    where: { id: videoDbId },
    data: { status: 'processing', videoType },
  });

  const isShort = videoType === 'short';

  // ─── STEP 1: Extrair Transcrição ──────────────────────────────────
  let transcriptText: string;

  try {
    const stepStart = Date.now();

    // Se já tem transcrição salva, reutilizar
    if (video.transcriptRaw) {
      log.info('Reutilizando transcrição existente do banco');
      transcriptText = video.transcriptRaw;
      steps.push({ step: 'transcript', success: true, durationMs: Date.now() - stepStart });
    } else {
      const transcript = await extractAndSaveTranscript(videoDbId, video.youtubeId);
      transcriptText = transcript.text;
      steps.push({ step: 'transcript', success: true, durationMs: Date.now() - stepStart });
    }
  } catch (error: any) {
    log.error({ err: error.message }, 'Falha na transcrição');
    steps.push({ step: 'transcript', success: false, durationMs: 0, error: error.message });

    await prisma.video.update({
      where: { id: videoDbId },
      data: { 
        status: 'failed', 
        errorMessage: `Transcrição: ${error.message}`,
        retryCount: { increment: 1 }
      },
    });

    return {
      videoId: videoDbId,
      youtubeId: video.youtubeId,
      title: video.title,
      status: 'failed',
      markdownPath: null,
      error: `Transcrição falhou: ${error.message}`,
      steps,
    };
  }

  // ─── STEP 2: Sintetizar via LLM ──────────────────────────────────
  let markdownContent: string;

  try {
    const stepStart = Date.now();

    const metadata: VideoMetadata = {
      youtubeId: video.youtubeId,
      title: video.title,
      channelName: video.channelName,
      url: video.url,
      duration: video.duration ? formatDuration(video.duration) : null,
      isShort,
    };

    const provider = getLLMProvider();
    // Usar prompt diferenciado para shorts vs vídeos normais
    const synthesis = await provider.summarize(transcriptText, metadata);
    markdownContent = synthesis.markdown;

    log.info({ isShort, videoType }, isShort ? '📱 Usando prompt de short' : '🎬 Usando prompt de vídeo normal');

    // Log de auditoria
    await prisma.processingLog.create({
      data: {
        videoId: videoDbId,
        action: 'summarize',
        success: true,
        durationMs: Date.now() - stepStart,
        metadata: JSON.stringify({
          model: synthesis.model,
          tokensUsed: synthesis.tokensUsed,
          outputLength: markdownContent.length,
        }),
      },
    });

    steps.push({ step: 'summarize', success: true, durationMs: Date.now() - stepStart });
  } catch (error: any) {
    log.error({ err: error.message }, 'Falha na síntese LLM');
    steps.push({ step: 'summarize', success: false, durationMs: 0, error: error.message });

    await prisma.processingLog.create({
      data: {
        videoId: videoDbId,
        action: 'summarize',
        success: false,
        durationMs: 0,
        metadata: JSON.stringify({ error: error.message }),
      },
    });

    await prisma.video.update({
      where: { id: videoDbId },
      data: { 
        status: 'failed', 
        errorMessage: `LLM: ${error.message}`,
        retryCount: { increment: 1 }
      },
    });

    return {
      videoId: videoDbId,
      youtubeId: video.youtubeId,
      title: video.title,
      status: 'failed',
      markdownPath: null,
      error: `Síntese falhou: ${error.message}`,
      steps,
    };
  }

  // ─── STEP 3: Salvar .md ──────────────────────────────────────────
  let markdownPath: string;

  try {
    markdownPath = saveMarkdown(video.youtubeId, video.title, markdownContent);

    // Extrair tags do markdown
    const tagsMatch = markdownContent.match(/## 🏷️ Tags\n-\s*(.*?)\n/i);
    const tags = tagsMatch ? tagsMatch[1].trim() : null;

    await prisma.video.update({
      where: { id: videoDbId },
      data: { summaryPath: markdownPath, tags },
    });
  } catch (error: any) {
    log.error({ err: error.message }, 'Falha ao salvar .md');

    await prisma.video.update({
      where: { id: videoDbId },
      data: { 
        status: 'failed', 
        errorMessage: `Salvar .md: ${error.message}`,
        retryCount: { increment: 1 }
      },
    });

    return {
      videoId: videoDbId,
      youtubeId: video.youtubeId,
      title: video.title,
      status: 'failed',
      markdownPath: null,
      error: `Falha ao salvar arquivo: ${error.message}`,
      steps,
    };
  }

  // ─── STEP 4: Remover da Watch Later ──────────────────────────────
  let removeSuccess = false;

  // Só remove da WL se o vídeo é da playlist Watch Later
  if (video.source !== 'watchlater') {
    log.info(`Vídeo é da source '${video.source}' — pulando remoção da WL`);
    removeSuccess = true; // Não precisa remover, considerar sucesso
    steps.push({ step: 'remove', success: true, durationMs: 0 });
  } else {
    try {
      const stepStart = Date.now();
      removeSuccess = await removeAndMarkVideo(videoDbId, video.youtubeId, video.title);
      steps.push({ step: 'remove', success: removeSuccess, durationMs: Date.now() - stepStart });
    } catch (error: any) {
      log.warn({ err: error.message }, 'Falha ao remover da WL (vídeo processado com sucesso)');
      steps.push({ step: 'remove', success: false, durationMs: 0, error: error.message });
    }
  }

  // ─── STEP 5: Notificar WhatsApp ──────────────────────────────────
  try {
    await notifyWhatsApp({
      title: video.title,
      channelName: video.channelName,
      url: video.url,
      duration: video.duration ? formatDuration(video.duration) : null,
      isShort,
      markdownContent,
    });
    steps.push({ step: 'notify', success: true, durationMs: 0 });
  } catch (error: any) {
    // WhatsApp é opcional — não falhar o pipeline por causa disso
    log.warn({ err: error.message }, 'Falha ao notificar WhatsApp (continuando)');
    steps.push({ step: 'notify', success: false, durationMs: 0, error: error.message });
  }

  // ─── FINALIZAR ───────────────────────────────────────────────────
  const finalStatus = removeSuccess ? 'success' : 'partial';

  await prisma.video.update({
    where: { id: videoDbId },
    data: {
      status: 'done',
      processedAt: new Date(),
      errorMessage: removeSuccess ? null : 'Processado mas não removido da WL',
    },
  });

  log.info(
    { youtubeId: video.youtubeId, title: video.title, status: finalStatus, videoType },
    '🏁 Pipeline concluído',
  );

  return {
    videoId: videoDbId,
    youtubeId: video.youtubeId,
    title: video.title,
    status: finalStatus,
    markdownPath,
    error: removeSuccess ? null : 'Vídeo processado mas não removido da WL',
    steps,
  };
}
