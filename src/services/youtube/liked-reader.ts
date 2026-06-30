import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createChildLogger } from '../../utils/logger.js';
import { getConfig } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import type { PlaylistVideo } from '../../types/index.js';

const execFileAsync = promisify(execFile);
const log = createChildLogger('liked-reader');

const LL_URL = 'https://www.youtube.com/playlist?list=LL';

/**
 * Limiar de duração para classificar como Short (em segundos).
 */
const SHORT_THRESHOLD = 60;

/**
 * Classifica um vídeo como 'short' ou 'video' baseado na duração.
 */
export function classifyVideoType(duration: number | null): 'short' | 'video' {
  if (duration === null) return 'video'; // se não sabe a duração, assume vídeo normal
  return duration <= SHORT_THRESHOLD ? 'short' : 'video';
}

/**
 * Lê a playlist "Liked Videos" via yt-dlp e retorna os vídeos.
 * Usa `--flat-playlist --dump-json` para extrair apenas metadados (sem download).
 */
export async function fetchLikedVideos(): Promise<PlaylistVideo[]> {
  log.info('Iniciando leitura da playlist Liked Videos via yt-dlp...');

  const config = getConfig();
  const cookiesArg = '--cookies-from-browser';
  const browserArg = config.COOKIES_BROWSER;

  try {
    const { stdout, stderr } = await execFileAsync('yt-dlp', [
      '--flat-playlist',
      '--dump-json',
      cookiesArg,
      browserArg,
      '--no-warnings',
      '--ignore-errors',
      LL_URL,
    ], {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer para playlists grandes
      timeout: 180_000,            // 3 minutos timeout (liked pode ser grande)
    });

    if (stderr) {
      log.warn({ stderr: stderr.slice(0, 500) }, 'yt-dlp warnings');
    }

    const lines = stdout.trim().split('\n').filter(Boolean);
    const videos: PlaylistVideo[] = [];

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        videos.push({
          youtubeId: data.id,
          title: data.title || 'Sem título',
          channelName: data.uploader || data.channel || 'Desconhecido',
          url: data.url || data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`,
          duration: data.duration ? Math.round(data.duration) : null,
          thumbnailUrl: data.thumbnail || null,
        });
      } catch (parseErr) {
        log.warn({ line: line.slice(0, 100) }, 'Falha ao parsear linha do yt-dlp');
      }
    }

    log.info({ count: videos.length }, 'Vídeos extraídos da playlist Liked');
    return videos;

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      log.error('yt-dlp não encontrado no PATH. Instale com: pip install yt-dlp');
      throw new Error('yt-dlp não está instalado. Execute: pip install yt-dlp');
    }

    log.error({ err: error.message }, 'Erro ao executar yt-dlp para Liked Videos');
    throw new Error(`Falha ao ler playlist Liked: ${error.message}`);
  }
}

/**
 * Sincroniza os vídeos curtidos com o banco de dados.
 * - Insere novos vídeos com source='liked'
 * - Classifica como short ou video baseado na duração
 * - Retorna contagens detalhadas
 */
export async function syncLikedToDb(): Promise<{
  newVideos: number;
  totalInPlaylist: number;
  shorts: number;
  videos: number;
}> {
  log.info('Sincronizando playlist Liked com o banco de dados...');

  const playlistVideos = await fetchLikedVideos();
  let newVideos = 0;
  let shorts = 0;
  let videos = 0;

  for (const video of playlistVideos) {
    const videoType = classifyVideoType(video.duration);

    if (videoType === 'short') {
      shorts++;
    } else {
      videos++;
    }

    const existing = await prisma.video.findUnique({
      where: { youtubeId: video.youtubeId },
    });

    if (!existing) {
      await prisma.video.create({
        data: {
          youtubeId: video.youtubeId,
          title: video.title,
          channelName: video.channelName,
          url: video.url,
          duration: video.duration,
          thumbnailUrl: video.thumbnailUrl,
          source: 'liked',
          videoType,
          status: 'pending',
        },
      });
      newVideos++;
      log.debug({ title: video.title, videoType }, 'Novo vídeo curtido registrado');
    } else if (existing.source !== 'liked') {
      // Se o vídeo já existe da WL, só atualizar source para indicar que também foi curtido
      // Não sobrescrever, manter o source original
      log.debug({ title: video.title }, 'Vídeo já existe (source diferente), ignorando');
    }
  }

  // Atualizar timestamp do último sync de curtidos
  await prisma.appState.upsert({
    where: { key: 'lastLikedSyncAt' },
    update: { value: new Date().toISOString() },
    create: { key: 'lastLikedSyncAt', value: new Date().toISOString() },
  });

  log.info(
    { newVideos, totalInPlaylist: playlistVideos.length, shorts, videos },
    'Sync de curtidos concluído',
  );

  return { newVideos, totalInPlaylist: playlistVideos.length, shorts, videos };
}

/**
 * Retorna analytics dos vídeos curtidos.
 */
export async function getLikedAnalytics(filterType?: 'short' | 'video'): Promise<{
  total: number;
  shorts: number;
  videos: number;
  topChannels: { channelName: string; count: number }[];
  totalDuration: number;
  avgDuration: number;
  recent: { title: string; channelName: string; url: string; videoType: string; duration: number | null }[];
}> {
  const where: any = { source: 'liked' };
  if (filterType) {
    where.videoType = filterType;
  }

  const [total, shortCount, videoCount] = await Promise.all([
    prisma.video.count({ where: { source: 'liked', ...(filterType ? { videoType: filterType } : {}) } }),
    prisma.video.count({ where: { source: 'liked', videoType: 'short' } }),
    prisma.video.count({ where: { source: 'liked', videoType: 'video' } }),
  ]);

  // Top canais
  const allVideos = await prisma.video.findMany({
    where,
    select: { channelName: true },
  });

  const channelCounts = new Map<string, number>();
  for (const v of allVideos) {
    channelCounts.set(v.channelName, (channelCounts.get(v.channelName) || 0) + 1);
  }

  const topChannels = Array.from(channelCounts.entries())
    .map(([channelName, count]) => ({ channelName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Duração total e média
  const durationAgg = await prisma.video.aggregate({
    where: { ...where, duration: { not: null } },
    _sum: { duration: true },
    _avg: { duration: true },
  });

  // Últimos 5
  const recent = await prisma.video.findMany({
    where,
    orderBy: { discoveredAt: 'desc' },
    take: 5,
    select: { title: true, channelName: true, url: true, videoType: true, duration: true },
  });

  return {
    total,
    shorts: shortCount,
    videos: videoCount,
    topChannels,
    totalDuration: durationAgg._sum.duration || 0,
    avgDuration: Math.round(durationAgg._avg.duration || 0),
    recent,
  };
}
