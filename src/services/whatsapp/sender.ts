import { getWhatsAppSocket, findGroupByName, sendMessage, getWhatsAppStatus } from './client.js';
import { formatForWhatsApp, formatDailyDigest } from './formatter.js';
import { getConfig } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('whatsapp-sender');

// Cache do JID do grupo
let cachedGroupJid: string | null = null;

/**
 * Obtém o JID do grupo destino (com cache).
 */
async function getTargetGroupJid(): Promise<string | null> {
  if (cachedGroupJid) return cachedGroupJid;

  const config = getConfig();
  const groupName = config.WHATSAPP_GROUP_NAME;

  if (!groupName) {
    log.warn('WHATSAPP_GROUP_NAME não configurado');
    return null;
  }

  cachedGroupJid = await findGroupByName(groupName);
  return cachedGroupJid;
}

/**
 * Invalida o cache do grupo (usado quando o grupo muda).
 */
export function clearGroupCache(): void {
  cachedGroupJid = null;
}

/**
 * Notifica via WhatsApp quando um vídeo é processado.
 * Respeita o modo configurado (always ou digest).
 */
export async function notifyWhatsApp(options: {
  title: string;
  channelName: string;
  url: string;
  duration: string | null;
  isShort: boolean;
  markdownContent: string;
}): Promise<void> {
  const config = getConfig();

  if (!config.WHATSAPP_ENABLED) {
    return; // WhatsApp desabilitado, silenciosamente ignorar
  }

  const { connected } = getWhatsAppStatus();
  if (!connected) {
    log.debug('WhatsApp não conectado, pulando notificação');
    return;
  }

  const mode = config.WHATSAPP_MODE;

  if (mode === 'digest') {
    // No modo digest, apenas logamos que o vídeo foi processado
    // O digest diário coletará do banco
    log.debug({ title: options.title }, 'Modo digest: vídeo será incluído no próximo digest');
    return;
  }

  // Modo 'always' — enviar imediatamente
  const jid = await getTargetGroupJid();
  if (!jid) {
    log.warn('Grupo WhatsApp não encontrado. Notificação não enviada.');
    return;
  }

  const message = formatForWhatsApp(options);
  const sent = await sendMessage(jid, message);

  if (sent) {
    log.info({ title: options.title }, '📱 Notificação WhatsApp enviada');
  }
}

/**
 * Envia o digest diário com todos os vídeos processados hoje.
 */
export async function sendDailyDigestWhatsApp(): Promise<void> {
  const config = getConfig();

  if (!config.WHATSAPP_ENABLED) return;

  const { connected } = getWhatsAppStatus();
  if (!connected) {
    log.warn('WhatsApp não conectado, digest não enviado');
    return;
  }

  const jid = await getTargetGroupJid();
  if (!jid) {
    log.warn('Grupo WhatsApp não encontrado. Digest não enviado.');
    return;
  }

  // Buscar vídeos processados hoje
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const processedToday = await prisma.video.findMany({
    where: {
      status: 'done',
      processedAt: { gte: today },
    },
    select: {
      title: true,
      channelName: true,
      url: true,
      videoType: true,
    },
    orderBy: { processedAt: 'desc' },
  });

  const videos = processedToday.map(v => ({
    title: v.title,
    channelName: v.channelName,
    url: v.url,
    isShort: v.videoType === 'short',
  }));

  const message = formatDailyDigest(videos);
  const sent = await sendMessage(jid, message);

  if (sent) {
    log.info({ count: videos.length }, '📱 Digest diário enviado via WhatsApp');
  }
}
