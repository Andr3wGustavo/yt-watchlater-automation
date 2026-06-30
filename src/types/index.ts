// ============================================
// Tipos compartilhados do Watch Later Agent
// ============================================

/**
 * Origem do vídeo.
 */
export type VideoSource = 'watchlater' | 'liked';

/**
 * Tipo do vídeo baseado na duração.
 */
export type VideoType = 'video' | 'short';

/**
 * Vídeo extraído da playlist via yt-dlp.
 */
export interface PlaylistVideo {
  youtubeId: string;
  title: string;
  channelName: string;
  url: string;
  duration: number | null;     // segundos
  thumbnailUrl: string | null;
}

/**
 * Resultado da extração de transcrição.
 */
export interface TranscriptResult {
  text: string;
  language: string;
  segments: TranscriptSegment[];
}

export interface TranscriptSegment {
  text: string;
  offset: number;   // ms
  duration: number;  // ms
}

/**
 * Metadados do vídeo para o prompt do LLM.
 */
export interface VideoMetadata {
  youtubeId: string;
  title: string;
  channelName: string;
  url: string;
  duration: string | null;  // formatado "12:34"
  isShort?: boolean;        // true se for um Short (≤60s)
}

/**
 * Resultado da síntese do LLM.
 */
export interface SynthesisResult {
  markdown: string;
  tokensUsed: number;
  model: string;
}

/**
 * Status de processamento de um vídeo.
 */
export type VideoStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped';

/**
 * Ação registrada no ProcessingLog.
 */
export type ProcessingAction = 'sync' | 'transcript' | 'summarize' | 'remove' | 'notify';

/**
 * Resultado do pipeline de processamento completo.
 */
export interface PipelineResult {
  videoId: string;
  youtubeId: string;
  title: string;
  status: 'success' | 'partial' | 'failed';
  markdownPath: string | null;
  error: string | null;
  steps: PipelineStepResult[];
}

export interface PipelineStepResult {
  step: ProcessingAction;
  success: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Progresso para reportar no Discord durante processamento em fila.
 */
export interface QueueProgress {
  current: number;
  total: number;
  currentTitle: string;
  step: string;
}

/**
 * Interface genérica para o provider de LLM.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  summarize(transcript: string, metadata: VideoMetadata): Promise<SynthesisResult>;
}
