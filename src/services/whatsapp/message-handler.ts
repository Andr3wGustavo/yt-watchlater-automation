import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { sendMessage } from './client.js';
import { createChildLogger } from '../../utils/logger.js';
import { prisma } from '../../db/client.js';
import { syncPlaylistToDb } from '../youtube/playlist-reader.js';
import { syncLikedToDb } from '../youtube/liked-reader.js';
import { processVideoFromDb, processDirectUrl } from '../pipeline/processor.js';
import { formatForWhatsApp } from './formatter.js';
import { extractVideoId } from '../../utils/helpers.js';

const log = createChildLogger('whatsapp:handler');

export async function handleIncomingMessage(msg: WAMessage, sock: WASocket) {
  if (!msg.message) return; // No content

  // Extract text
  const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
  if (!text) return;

  const jid = msg.key.remoteJid;
  if (!jid) return;

  // Check if it's from me (the bot account itself sending a command from another device)
  // In Baileys, msg.key.fromMe tells if the account running the bot sent it.
  // We want to respond to the group or our own DMs.
  // For safety, we only respond to commands.
  
  if (text.startsWith('!')) {
    log.info({ jid, text }, 'Comando recebido no WhatsApp');
    await handleCommand(text, jid, sock);
    return;
  }

  // Handle direct YouTube URL (Future task)
  if (text.includes('youtube.com/') || text.includes('youtu.be/')) {
    const videoId = extractVideoId(text);
    if (videoId) {
      log.info({ videoId }, 'Detectado link do YouTube solto no WhatsApp');
      await handleDirectUrl(text, jid);
    }
  }
}

async function handleDirectUrl(url: string, jid: string) {
  await sendMessage(jid, '⏳ Link detectado! Processando e gerando resumo instantâneo...');
  
  try {
    const result = await processDirectUrl(url);

    if (result.status === 'success' && result.markdownPath) {
      const fs = await import('node:fs');
      const markdownContent = fs.readFileSync(result.markdownPath, 'utf8');
      
      const wppMsg = formatForWhatsApp({
        title: result.title || 'Resumo',
        channelName: 'YouTube',
        url: url,
        duration: null,
        isShort: false,
        markdownContent,
      });

      await sendMessage(jid, `✅ Processado!\n\n${wppMsg}`);
    } else {
      await sendMessage(jid, `❌ Falha ao processar vídeo:\n${result.error}`);
    }
  } catch (error: any) {
    log.error({ err: error.message }, 'Erro ao processar URL direta');
    await sendMessage(jid, `❌ Erro inesperado: ${error.message}`);
  }
}

async function handleCommand(text: string, jid: string, sock: WASocket) {
  const args = text.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  try {
    switch (command) {
      case '!ping':
        await sendMessage(jid, '🏓 Pong! O Watch Later Agent está online.');
        break;

      case '!status':
        await handleStatus(jid);
        break;

      case '!sync':
        await sendMessage(jid, '🔄 Sincronizando playlist "Assistir Mais Tarde"...');
        const syncWL = await syncPlaylistToDb();
        await sendMessage(jid, `✅ Sync concluído!\n🆕 ${syncWL.newVideos} novos vídeos encontrados.\nTotal na WL: ${syncWL.totalInPlaylist}`);
        break;

      case '!sync-curtidos':
        await sendMessage(jid, '❤️ Sincronizando playlist "Vídeos Curtidos"...');
        const syncLiked = await syncLikedToDb();
        await sendMessage(jid, `✅ Sync concluído!\n🆕 ${syncLiked.newVideos} novos vídeos curtidos encontrados.\nTotal de curtidos: ${syncLiked.totalInPlaylist}`);
        break;

      case '!processar':
        await handleProcessar(jid);
        break;

      default:
        // Comando não reconhecido, ignorar para não fazer spam.
        break;
    }
  } catch (error: any) {
    log.error({ err: error.message, command }, 'Erro ao processar comando WhatsApp');
    await sendMessage(jid, `❌ Erro ao executar comando: ${error.message}`);
  }
}

async function handleStatus(jid: string) {
  const [total, pending, processing, done, failed, skipped] = await Promise.all([
    prisma.video.count(),
    prisma.video.count({ where: { status: 'pending' } }),
    prisma.video.count({ where: { status: 'processing' } }),
    prisma.video.count({ where: { status: 'done' } }),
    prisma.video.count({ where: { status: 'failed' } }),
    prisma.video.count({ where: { status: 'skipped' } }),
  ]);

  const lastSync = await prisma.appState.findUnique({ where: { key: 'lastSyncAt' } });
  const lastSyncStr = lastSync ? new Date(lastSync.value).toLocaleString('pt-BR') : 'Nunca';

  const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;
  const filled = Math.round(progressPercent / 10);
  const empty = 10 - filled;
  const bar = '🟩'.repeat(filled) + '⬜'.repeat(empty);

  let msg = `🧠 *Watch Later Agent — Status*\n\n`;
  msg += `${bar} ${progressPercent}% consumido\n\n`;
  msg += `📊 Total: ${total}\n`;
  msg += `⏳ Pendentes: ${pending}\n`;
  msg += `✅ Concluídos: ${done}\n`;
  msg += `❌ Falhos: ${failed}\n\n`;
  msg += `🔄 Último Sync: ${lastSyncStr}`;

  await sendMessage(jid, msg);
}

async function handleProcessar(jid: string) {
  await sendMessage(jid, '⏳ Processando próximo vídeo da fila...');
  
  const video = await prisma.video.findFirst({
    where: { status: 'pending' },
    orderBy: { discoveredAt: 'asc' },
  });

  if (!video) {
    await sendMessage(jid, '📭 Nenhum vídeo pendente na fila.');
    return;
  }

  const result = await processVideoFromDb(video.id);

  if (result.status === 'success' && result.markdownPath) {
    // Para o WhatsApp, podemos ler o markdown e usar o formatter para enviar um bom resumo em texto.
    const fs = await import('node:fs');
    const markdownContent = fs.readFileSync(result.markdownPath, 'utf8');
    
    const wppMsg = formatForWhatsApp({
      title: result.title || video.title,
      channelName: video.channelName,
      url: `https://youtu.be/${video.id}`,
      duration: null,
      isShort: false,
      markdownContent,
    });

    await sendMessage(jid, `✅ Processado!\n\n${wppMsg}`);
  } else {
    await sendMessage(jid, `❌ Falha ao processar *${video.title}*:\n${result.error}`);
  }
}
