import type { TextChannel, Client } from 'discord.js';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { prisma } from '../../db/client.js';
import { syncPlaylistToDb } from '../youtube/playlist-reader.js';
import { syncLikedToDb } from '../youtube/liked-reader.js';
import { processVideoFromDb } from '../pipeline/processor.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('autopilot');

interface AutopilotState {
  active: boolean;
  intervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
  channelId: string | null;
  client: Client | null;
  processedCount: number;
  startedAt: Date | null;
}

const state: AutopilotState = {
  active: false,
  intervalMs: 60 * 60 * 1000, // 1 hora padrão
  timer: null,
  channelId: null,
  client: null,
  processedCount: 0,
  startedAt: null,
};

/**
 * Retorna o estado atual do autopilot.
 */
export function getAutopilotStatus(): {
  active: boolean;
  intervalMinutes: number;
  channelId: string | null;
  processedCount: number;
  startedAt: Date | null;
} {
  return {
    active: state.active,
    intervalMinutes: Math.round(state.intervalMs / 60_000),
    channelId: state.channelId,
    processedCount: state.processedCount,
    startedAt: state.startedAt,
  };
}

/**
 * Inicia o modo autopilot.
 * Processa 1 vídeo imediatamente e depois repete a cada intervalo.
 */
export async function startAutopilot(
  client: Client,
  channelId: string,
  intervalMinutes: number = 60,
): Promise<void> {
  // Parar qualquer autopilot existente
  if (state.active) {
    stopAutopilot();
  }

  state.active = true;
  state.intervalMs = intervalMinutes * 60 * 1000;
  state.channelId = channelId;
  state.client = client;
  state.processedCount = 0;
  state.startedAt = new Date();

  // Salvar estado no banco
  await prisma.appState.upsert({
    where: { key: 'autopilot_active' },
    update: { value: 'true' },
    create: { key: 'autopilot_active', value: 'true' },
  });

  await prisma.appState.upsert({
    where: { key: 'autopilot_interval' },
    update: { value: String(intervalMinutes) },
    create: { key: 'autopilot_interval', value: String(intervalMinutes) },
  });

  await prisma.appState.upsert({
    where: { key: 'autopilot_channel' },
    update: { value: channelId },
    create: { key: 'autopilot_channel', value: channelId },
  });

  log.info(
    { intervalMinutes, channelId },
    `🤖 Autopilot LIGADO — processando 1 vídeo a cada ${intervalMinutes} minutos`,
  );

  // Processar o primeiro imediatamente
  await processNext();

  // Agendar os próximos
  state.timer = setInterval(async () => {
    if (!state.active) {
      stopAutopilot();
      return;
    }
    await processNext();
  }, state.intervalMs);
}

/**
 * Para o modo autopilot.
 */
export function stopAutopilot(): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }

  const wasActive = state.active;
  state.active = false;

  // Atualizar banco
  prisma.appState.upsert({
    where: { key: 'autopilot_active' },
    update: { value: 'false' },
    create: { key: 'autopilot_active', value: 'false' },
  }).catch(() => {});

  if (wasActive) {
    log.info(
      { processedCount: state.processedCount },
      '🛑 Autopilot DESLIGADO',
    );
  }
}

/**
 * Processa o próximo vídeo pendente e envia no canal do Discord.
 */
async function processNext(): Promise<void> {
  if (!state.client || !state.channelId) return;

  try {
    const channel = await state.client.channels.fetch(state.channelId);
    if (!channel || !('send' in channel)) {
      log.error('Canal do autopilot não encontrado ou não é um canal de texto');
      stopAutopilot();
      return;
    }

    const textChannel = channel as TextChannel;

    // Verificar se há vídeos pendentes
    let pendingCount = await prisma.video.count({ 
      where: { 
        OR: [
          { status: 'pending' },
          { status: 'failed', retryCount: { lt: 3 } }
        ]
      } 
    });

    if (pendingCount === 0) {
      // Tentar sync antes de desistir
      log.info('Sem vídeos pendentes, rodando sync (Watch Later & Curtidos)...');
      const syncWL = await syncPlaylistToDb();
      const syncLiked = await syncLikedToDb();
      const totalNew = syncWL.newVideos + syncLiked.newVideos;

      if (totalNew === 0) {
        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('🤖 Autopilot')
          .setDescription('📭 Playlists vazias! Todos os vídeos foram processados.\n🛑 Autopilot desligado automaticamente.')
          .setTimestamp();

        await textChannel.send({ embeds: [embed] });
        stopAutopilot();
        return;
      }

      await textChannel.send(`🔄 Sync: **${totalNew}** vídeo(s) novo(s) encontrado(s) (${syncWL.newVideos} na WL, ${syncLiked.newVideos} nos Curtidos).`);
    }

    // Pegar o mais antigo pendente ou falho (retryable)
    const video = await prisma.video.findFirst({
      where: { 
        OR: [
          { status: 'pending' },
          { status: 'failed', retryCount: { lt: 3 } }
        ]
      },
      orderBy: { discoveredAt: 'asc' },
    });

    if (!video) {
      log.warn('Nenhum vídeo pendente encontrado após sync');
      return;
    }

    // Notificar início
    const totalPending = await prisma.video.count({ 
      where: { 
        OR: [
          { status: 'pending' },
          { status: 'failed', retryCount: { lt: 3 } }
        ]
      } 
    });

    const startEmbed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('🤖 Autopilot — Processando')
      .setDescription(`**${video.title}**\n_${video.channelName}_`)
      .addFields(
        { name: '📊 Restantes', value: `${totalPending}`, inline: true },
        { name: '✅ Processados nesta sessão', value: `${state.processedCount}`, inline: true },
      )
      .setTimestamp();

    if (video.thumbnailUrl) startEmbed.setThumbnail(video.thumbnailUrl);

    await textChannel.send({ embeds: [startEmbed] });

    // Processar
    const result = await processVideoFromDb(video.id);

    if (result.status === 'success' && result.markdownPath) {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const fileBuffer = fs.readFileSync(result.markdownPath);
      const fileName = path.basename(result.markdownPath);
      const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

      state.processedCount++;

      const doneEmbed = new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle('🤖 Autopilot — Concluído ✅')
        .setDescription(`**${result.title}** processado e removido da WL!`)
        .addFields(
          { name: '✅ Sessão', value: `${state.processedCount} processado(s)`, inline: true },
          { name: '📊 Restantes', value: `${totalPending - 1}`, inline: true },
          { name: '⏰ Próximo em', value: `${Math.round(state.intervalMs / 60_000)} min`, inline: true },
        )
        .setTimestamp();

      await textChannel.send({ embeds: [doneEmbed], files: [attachment] });
    } else {
      const failEmbed = new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle('🤖 Autopilot — Falhou ❌')
        .setDescription(`**${video.title}**\nErro: ${result.error}`)
        .addFields(
          { name: '⏰ Próximo em', value: `${Math.round(state.intervalMs / 60_000)} min`, inline: true },
        )
        .setTimestamp();

      await textChannel.send({ embeds: [failEmbed] });
    }
  } catch (error: any) {
    log.error({ err: error.message }, 'Erro no ciclo do autopilot');
  }
}
