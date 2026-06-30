import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createChildLogger } from '../../utils/logger.js';
import { getConfig } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import type { PlaylistVideo } from '../../types/index.js';

const execFileAsync = promisify(execFile);
const log = createChildLogger('playlist-reader');

const WL_URL = 'https://www.youtube.com/playlist?list=WL';
const DATA_DIR = path.resolve(process.cwd(), 'data');

/**
 * Lê a playlist "Assistir Mais Tarde" via yt-dlp e retorna os vídeos.
 * Usa `--flat-playlist --dump-json` para extrair apenas metadados (sem download).
 */
export async function fetchPlaylistVideos(): Promise<PlaylistVideo[]> {
  log.info('Iniciando leitura da playlist Watch Later via yt-dlp...');

  const config = getConfig();
  const cookiesArg = `--cookies-from-browser`;
  const browserArg = config.COOKIES_BROWSER;

  try {
    const { stdout, stderr } = await execFileAsync('yt-dlp', [
      '--flat-playlist',
      '--dump-json',
      cookiesArg,
      browserArg,
      '--no-warnings',
      '--ignore-errors',
      WL_URL,
    ], {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer para playlists grandes
      timeout: 120_000,            // 2 minutos timeout
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

    log.info({ count: videos.length }, 'Vídeos extraídos da playlist');
    return videos;

  } catch (error: any) {
    // Se yt-dlp não está instalado ou falhou
    if (error.code === 'ENOENT') {
      log.error('yt-dlp não encontrado no PATH. Instale com: pip install yt-dlp');
      throw new Error('yt-dlp não está instalado. Execute: pip install yt-dlp');
    }

    log.error({ err: error.message }, 'Erro ao executar yt-dlp');
    throw new Error(`Falha ao ler playlist: ${error.message}`);
  }
}

/**
 * Sincroniza os vídeos da playlist com o banco de dados.
 * - Insere novos vídeos (status: pending)
 * - Retorna contagem de novos vídeos encontrados
 */
export async function syncPlaylistToDb(): Promise<{ newVideos: number; totalInPlaylist: number }> {
  log.info('Sincronizando playlist com o banco de dados...');

  const videos = await fetchPlaylistVideos();
  let newVideos = 0;

  for (const video of videos) {
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
          status: 'pending',
        },
      });
      newVideos++;
      log.debug({ title: video.title }, 'Novo vídeo registrado');
    }
  }

  // Atualizar timestamp do último sync
  await prisma.appState.upsert({
    where: { key: 'lastSyncAt' },
    update: { value: new Date().toISOString() },
    create: { key: 'lastSyncAt', value: new Date().toISOString() },
  });

  log.info({ newVideos, totalInPlaylist: videos.length }, 'Sync concluído');
  return { newVideos, totalInPlaylist: videos.length };
}
