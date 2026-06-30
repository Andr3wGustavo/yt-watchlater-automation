import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { BotCommand } from './index.js';
import { prisma } from '../../db/client.js';
import { getAutopilotStatus } from '../../services/autopilot/scheduler.js';
import { getWhatsAppStatus } from '../../services/whatsapp/client.js';
import { getConfig } from '../../config/env.js';

export const painelCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const embed = await buildPainelEmbed();
    const components = buildPainelButtons();

    await interaction.editReply({
      embeds: [embed],
      components,
    });
  },
};

/**
 * Constrói o embed do painel com stats atualizados.
 * Exportado para reuso no botão de refresh.
 */
export async function buildPainelEmbed(): Promise<EmbedBuilder> {
  const [total, pending, done, failed, likedShorts, likedVideos] = await Promise.all([
    prisma.video.count({ where: { source: 'watchlater' } }),
    prisma.video.count({ where: { source: 'watchlater', status: 'pending' } }),
    prisma.video.count({ where: { source: 'watchlater', status: 'done' } }),
    prisma.video.count({ where: { source: 'watchlater', status: 'failed' } }),
    prisma.video.count({ where: { source: 'liked', videoType: 'short' } }),
    prisma.video.count({ where: { source: 'liked', videoType: 'video' } }),
  ]);

  // Tempo total pendente
  const pendingAgg = await prisma.video.aggregate({
    where: { status: 'pending', duration: { not: null } },
    _sum: { duration: true },
  });
  const totalSeconds = pendingAgg._sum.duration || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const timeStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;

  // Último sync
  const lastSync = await prisma.appState.findUnique({ where: { key: 'lastSyncAt' } });
  const lastSyncStr = lastSync
    ? `<t:${Math.floor(new Date(lastSync.value).getTime() / 1000)}:R>`
    : '`Nunca`';

  // Barra de progresso
  const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;
  const filledBlocks = Math.round(progressPercent / 10);
  const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(10 - filledBlocks);

  // Status do autopilot
  const autopilot = getAutopilotStatus();
  const autopilotStr = autopilot.active
    ? `🟢 **LIGADO** — 1 vídeo a cada **${autopilot.intervalMinutes}min** │ Processados: **${autopilot.processedCount}**`
    : '🔴 **DESLIGADO**';

  // Status do WhatsApp
  const config = getConfig();
  let whatsappStr = '🔴 **DESABILITADO**';
  if (config.WHATSAPP_ENABLED) {
    const { connected } = getWhatsAppStatus();
    const wappMode = config.WHATSAPP_MODE === 'digest' ? 'Digest (Diário)' : 'Sempre';
    whatsappStr = connected
      ? `🟢 **CONECTADO** │ Modo: **${wappMode}**`
      : `🟡 **DESCONECTADO** │ Use /whatsapp-setup`;
  }

  // Estatísticas de Curtidos
  const totalLiked = likedShorts + likedVideos;
  const likedStr = totalLiked > 0 
    ? `Total: **${totalLiked}** │ 📱 Shorts: **${likedShorts}** │ 🎬 Vídeos: **${likedVideos}**`
    : '`Nenhum curtido sincronizado`';

  const embed = new EmbedBuilder()
    .setColor(autopilot.active ? 0x00FF88 : 0x3498DB)
    .setTitle('🧠 Watch Later Agent')
    .setDescription(
      '```\n' +
      '╔══════════════════════════════════════╗\n' +
      '║         SEGUNDO CÉREBRO              ║\n' +
      '║    Painel de Controle                ║\n' +
      '╚══════════════════════════════════════╝\n' +
      '```'
    )
    .addFields(
      {
        name: '📊 Progresso',
        value: `\`${progressBar}\` **${progressPercent}%**\n` +
               `Total: **${total}** │ Pendentes: **${pending}** │ Feitos: **${done}** │ Falhos: **${failed}**`,
        inline: false,
      },
      {
        name: '🤖 Autopilot',
        value: autopilotStr,
        inline: false,
      },
      {
        name: '📱 WhatsApp',
        value: whatsappStr,
        inline: false,
      },
      {
        name: '❤️ Vídeos Curtidos',
        value: likedStr,
        inline: false,
      },
      {
        name: '⏱️ Tempo Pendente',
        value: `**${timeStr}** de conteúdo`,
        inline: true,
      },
      {
        name: '🔄 Último Sync WL',
        value: lastSyncStr,
        inline: true,
      },
    )
    .setFooter({ text: 'Use os botões abaixo para controlar o agente' })
    .setTimestamp();

  return embed;
}

/**
 * Constrói as ActionRows de botões do painel.
 * Exportado para reuso no botão de refresh.
 */
export function buildPainelButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const autopilot = getAutopilotStatus();

  // ─── ROW 1: Ações principais ──────────────────────────────────
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('wl_sync')
      .setLabel('Sincronizar')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('wl_roleta')
      .setLabel('Roleta')
      .setEmoji('🎰')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('wl_status')
      .setLabel('Status Detalhado')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary),
  );

  // ─── ROW 2: Fila de processamento ─────────────────────────────
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('wl_fila_3')
      .setLabel('Fila (3)')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('wl_fila_5')
      .setLabel('Fila (5)')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('wl_fila_10')
      .setLabel('Fila (10)')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
  );

  // ─── ROW 3: Autopilot ─────────────────────────────────────────
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    // Botões de intervalo — ligar autopilot com tempos diferentes
    new ButtonBuilder()
      .setCustomId('wl_autopilot_30')
      .setLabel('Auto 30min')
      .setEmoji('⚡')
      .setStyle(autopilot.active && autopilot.intervalMinutes === 30 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(autopilot.active && autopilot.intervalMinutes === 30),
    new ButtonBuilder()
      .setCustomId('wl_autopilot_60')
      .setLabel('Auto 1h')
      .setEmoji('🤖')
      .setStyle(autopilot.active && autopilot.intervalMinutes === 60 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(autopilot.active && autopilot.intervalMinutes === 60),
    new ButtonBuilder()
      .setCustomId('wl_autopilot_120')
      .setLabel('Auto 2h')
      .setEmoji('🐢')
      .setStyle(autopilot.active && autopilot.intervalMinutes === 120 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(autopilot.active && autopilot.intervalMinutes === 120),
    // Botão de desligar
    new ButtonBuilder()
      .setCustomId('wl_autopilot_off')
      .setLabel('Desligar Auto')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!autopilot.active),
  );

  // ─── ROW 4: Utilitários e Novas Features ─────────────────────
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('wl_refresh_painel')
      .setLabel('Atualizar')
      .setEmoji('🔃')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('wl_sync_curtidos')
      .setLabel('Sync Curtidos')
      .setEmoji('❤️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('wl_recentes')
      .setLabel('Últimos')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('wl_falhos')
      .setLabel('Falhos')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );

  return [row1, row2, row3, row4];
}
