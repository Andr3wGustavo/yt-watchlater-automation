import {
  type ButtonInteraction,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { prisma } from '../../db/client.js';
import { syncPlaylistToDb } from '../../services/youtube/playlist-reader.js';
import { processVideoFromDb } from '../../services/pipeline/processor.js';
import { startAutopilot, stopAutopilot, getAutopilotStatus } from '../../services/autopilot/scheduler.js';
import { buildPainelEmbed, buildPainelButtons } from '../commands/painel.js';
import { syncLikedToDb } from '../../services/youtube/liked-reader.js';
import { createChildLogger } from '../../utils/logger.js';
import { formatDuration } from '../../utils/helpers.js';

const log = createChildLogger('buttons');

/**
 * Handler central para todas as interações de botão do painel.
 */
export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  // Ignorar botões que não são do Watch Later
  if (!id.startsWith('wl_')) return;

  try {
    switch (id) {
      case 'wl_sync':
        return await handleSync(interaction);
      case 'wl_sync_curtidos':
        return await handleSyncCurtidos(interaction);
      case 'wl_roleta':
        return await handleRoleta(interaction);
      case 'wl_status':
        return await handleStatus(interaction);
      case 'wl_fila_3':
        return await handleFila(interaction, 3);
      case 'wl_fila_5':
        return await handleFila(interaction, 5);
      case 'wl_fila_10':
        return await handleFila(interaction, 10);
      case 'wl_refresh_painel':
        return await handleRefreshPainel(interaction);
      case 'wl_recentes':
        return await handleRecentes(interaction);
      case 'wl_falhos':
        return await handleFalhos(interaction);
      case 'wl_autopilot_30':
        return await handleAutopilotStart(interaction, 30);
      case 'wl_autopilot_60':
        return await handleAutopilotStart(interaction, 60);
      case 'wl_autopilot_120':
        return await handleAutopilotStart(interaction, 120);
      case 'wl_autopilot_off':
        return await handleAutopilotStop(interaction);
      case 'wl_retry_all':
        return await handleRetryAll(interaction);
      default:
        log.warn({ customId: id }, 'Botão desconhecido');
    }
  } catch (error: any) {
    log.error({ customId: id, err: error.message }, 'Erro no handler de botão');
    try {
      const msg = `❌ Erro: ${error.message}`;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch {
      // silently fail
    }
  }
}

// ─── SYNC ──────────────────────────────────────────────────────────────
async function handleSync(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });

  const startTime = Date.now();
  const result = await syncPlaylistToDb();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const embed = new EmbedBuilder()
    .setColor(result.newVideos > 0 ? 0x00FF88 : 0x3498DB)
    .setTitle('🔄 Sync Concluído')
    .setDescription(
      result.newVideos > 0
        ? `**${result.newVideos}** vídeo(s) novo(s) encontrado(s)!`
        : 'Playlist sincronizada. Nenhum vídeo novo.'
    )
    .addFields(
      { name: '📺 Na Playlist', value: `${result.totalInPlaylist}`, inline: true },
      { name: '🆕 Novos', value: `${result.newVideos}`, inline: true },
      { name: '⏱️ Tempo', value: `${elapsed}s`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── SYNC CURTIDOS ──────────────────────────────────────────────────────
async function handleSyncCurtidos(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });

  const startTime = Date.now();
  const result = await syncLikedToDb();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const totalClassified = result.shorts + result.videos;
  const shortPercent = totalClassified > 0 ? Math.round((result.shorts / totalClassified) * 100) : 0;
  const videoPercent = 100 - shortPercent;

  const shortBar = '█'.repeat(Math.round(shortPercent / 10)) + '░'.repeat(10 - Math.round(shortPercent / 10));
  const videoBar = '█'.repeat(Math.round(videoPercent / 10)) + '░'.repeat(10 - Math.round(videoPercent / 10));

  const embed = new EmbedBuilder()
    .setColor(result.newVideos > 0 ? 0xFF4466 : 0x3498DB)
    .setTitle('❤️ Sync Curtidos — Concluído')
    .setDescription(
      result.newVideos > 0
        ? `**${result.newVideos}** vídeo(s) curtido(s) novo(s) encontrado(s)!`
        : 'Playlist de curtidos sincronizada. Nenhum novo.'
    )
    .addFields(
      { name: '📺 Total Curtidos', value: `${result.totalInPlaylist}`, inline: true },
      { name: '🆕 Novos', value: `${result.newVideos}`, inline: true },
      { name: '⏱️ Tempo', value: `${elapsed}s`, inline: true },
      {
        name: '📊 Classificação',
        value:
          `📱 Shorts: \`${shortBar}\` **${result.shorts}** (${shortPercent}%)\n` +
          `🎬 Vídeos: \`${videoBar}\` **${result.videos}** (${videoPercent}%)`,
        inline: false,
      },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── ROLETA ────────────────────────────────────────────────────────────
async function handleRoleta(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply();

  // Garantir que há vídeos pendentes
  let pendingCount = await prisma.video.count({ where: { status: 'pending' } });

  if (pendingCount === 0) {
    await interaction.editReply('🔄 Nenhum pendente. Sincronizando...');
    const sync = await syncPlaylistToDb();
    if (sync.newVideos === 0) {
      await interaction.editReply('📭 Playlist vazia! Nada para sortear.');
      return;
    }
  }

  const pendingVideos = await prisma.video.findMany({
    where: { status: 'pending' },
    orderBy: { discoveredAt: 'asc' },
  });

  if (pendingVideos.length === 0) {
    await interaction.editReply('📭 Nenhum vídeo pendente.');
    return;
  }

  // Peso para vídeos mais antigos
  const weights = pendingVideos.map((_, i) => pendingVideos.length - i);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  let selectedIndex = 0;
  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) { selectedIndex = i; break; }
  }

  const selected = pendingVideos[selectedIndex];

  const sortearEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎰 Roleta — Sorteando...')
    .setDescription(`**${selected.title}**\n_${selected.channelName}_`)
    .addFields(
      { name: '🔗 Link', value: selected.url, inline: true },
      { name: '📊 Posição', value: `${selectedIndex + 1}/${pendingVideos.length}`, inline: true },
    )
    .setTimestamp();

  if (selected.thumbnailUrl) sortearEmbed.setThumbnail(selected.thumbnailUrl);

  await interaction.editReply({ content: '⏳ Processando o vídeo sorteado...', embeds: [sortearEmbed] });

  const result = await processVideoFromDb(selected.id);

  if (result.status === 'success' && result.markdownPath) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fileBuffer = fs.readFileSync(result.markdownPath);
    const fileName = path.basename(result.markdownPath);
    const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

    sortearEmbed.setColor(0x00FF88).setTitle('🎰 Roleta — Concluído! ✅');
    await interaction.editReply({
      content: `✅ **${result.title}** processado e removido da WL!`,
      embeds: [sortearEmbed],
      files: [attachment],
    });
  } else {
    sortearEmbed.setColor(0xFF4444).setTitle('🎰 Roleta — Falhou ❌');
    await interaction.editReply({
      content: `❌ Falha: ${result.error}`,
      embeds: [sortearEmbed],
    });
  }
}

// ─── STATUS DETALHADO ──────────────────────────────────────────────────
async function handleStatus(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const [total, pending, processing, done, failed, skipped, removed] = await Promise.all([
    prisma.video.count(),
    prisma.video.count({ where: { status: 'pending' } }),
    prisma.video.count({ where: { status: 'processing' } }),
    prisma.video.count({ where: { status: 'done' } }),
    prisma.video.count({ where: { status: 'failed' } }),
    prisma.video.count({ where: { status: 'skipped' } }),
    prisma.video.count({ where: { removedFromWL: true } }),
  ]);

  const recentDone = await prisma.video.findMany({
    where: { status: 'done' },
    orderBy: { processedAt: 'desc' },
    take: 5,
    select: { title: true, channelName: true, processedAt: true },
  });

  const recentList = recentDone.length > 0
    ? recentDone.map((v, i) => `\`${i + 1}.\` **${v.title}** — _${v.channelName}_`).join('\n')
    : '_Nenhum vídeo processado ainda._';

  // Tempo pendente
  const pendingAgg = await prisma.video.aggregate({
    where: { status: 'pending', duration: { not: null } },
    _sum: { duration: true },
  });
  const totalSec = pendingAgg._sum.duration || 0;
  const timeStr = totalSec > 0 ? formatDuration(totalSec) : '0:00';

  const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;
  const bar = '█'.repeat(Math.round(progressPercent / 10)) + '░'.repeat(10 - Math.round(progressPercent / 10));

  const embed = new EmbedBuilder()
    .setColor(0x00FF88)
    .setTitle('📊 Status Detalhado')
    .setDescription(`\`${bar}\` **${progressPercent}%** consumido`)
    .addFields(
      { name: '📦 Total', value: `${total}`, inline: true },
      { name: '⏳ Pendentes', value: `${pending}`, inline: true },
      { name: '🔄 Processando', value: `${processing}`, inline: true },
      { name: '✅ Concluídos', value: `${done}`, inline: true },
      { name: '❌ Falhos', value: `${failed}`, inline: true },
      { name: '⏭️ Pulados', value: `${skipped}`, inline: true },
      { name: '🗑️ Removidos da WL', value: `${removed}`, inline: true },
      { name: '⏱️ Tempo Pendente', value: timeStr, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📝 Últimos Processados', value: recentList, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Watch Later Agent • Segundo Cérebro' });

  await interaction.editReply({ embeds: [embed] });
}

// ─── FILA ──────────────────────────────────────────────────────────────
async function handleFila(interaction: ButtonInteraction, quantidade: number): Promise<void> {
  await interaction.deferReply();

  let pendingCount = await prisma.video.count({ where: { status: 'pending' } });

  if (pendingCount === 0) {
    await interaction.editReply('🔄 Sincronizando playlist...');
    await syncPlaylistToDb();
  }

  const videos = await prisma.video.findMany({
    where: { status: 'pending' },
    orderBy: { discoveredAt: 'asc' },
    take: quantidade,
  });

  if (videos.length === 0) {
    await interaction.editReply('📭 Nenhum vídeo pendente.');
    return;
  }

  const total = videos.length;

  const filaEmbed = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle(`📋 Fila de Processamento (${total})`)
    .setDescription(videos.map((v, i) => `\`${i + 1}.\` ${v.title}`).join('\n'))
    .setTimestamp();

  await interaction.editReply({ content: `🚀 Processando **${total}** vídeo(s)...`, embeds: [filaEmbed] });

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];

    // Atualizar progresso
    filaEmbed.setDescription(
      videos.map((v, j) => {
        const prefix = j < i ? '✅' : j === i ? '⏳' : '⬜';
        return `${prefix} \`${j + 1}.\` ${v.title}`;
      }).join('\n')
    );

    await interaction.editReply({
      content: `⏳ Processando **${i + 1}/${total}**...`,
      embeds: [filaEmbed],
    });

    try {
      const result = await processVideoFromDb(video.id);

      if (result.status === 'success' && result.markdownPath) {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const fileBuffer = fs.readFileSync(result.markdownPath);
        const fileName = path.basename(result.markdownPath);
        const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

        await interaction.followUp({
          content: `📄 **[${i + 1}/${total}]** ${result.title}`,
          files: [attachment],
        });
        successCount++;
      } else {
        failCount++;
        await interaction.followUp({ content: `❌ **[${i + 1}/${total}]** ${video.title}: ${result.error}` });
      }
    } catch (error: any) {
      failCount++;
      await interaction.followUp({ content: `❌ **[${i + 1}/${total}]** ${video.title}: ${error.message}` });
    }
  }

  // Resultado final
  filaEmbed
    .setColor(failCount === 0 ? 0x00FF88 : 0xFFAA00)
    .setTitle('📋 Fila — Concluída!')
    .setDescription(
      videos.map((v, j) => {
        return `✅ \`${j + 1}.\` ${v.title}`;
      }).join('\n')
    );

  await interaction.editReply({
    content: `🏁 **Fila concluída!** ✅ ${successCount}/${total} │ ❌ ${failCount}/${total}`,
    embeds: [filaEmbed],
  });
}

// ─── REFRESH PAINEL ────────────────────────────────────────────────────
async function handleRefreshPainel(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();

  const embed = await buildPainelEmbed();
  const components = buildPainelButtons();

  await interaction.editReply({ embeds: [embed], components });
}

// ─── RECENTES ──────────────────────────────────────────────────────────
async function handleRecentes(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const recent = await prisma.video.findMany({
    where: { status: 'done' },
    orderBy: { processedAt: 'desc' },
    take: 10,
    select: { title: true, channelName: true, url: true, processedAt: true },
  });

  if (recent.length === 0) {
    await interaction.editReply('📭 Nenhum vídeo processado ainda.');
    return;
  }

  const list = recent.map((v, i) => {
    const time = v.processedAt ? `<t:${Math.floor(v.processedAt.getTime() / 1000)}:R>` : '';
    return `\`${i + 1}.\` [${v.title}](${v.url}) — _${v.channelName}_ ${time}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('📝 Últimos 10 Processados')
    .setDescription(list)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── FALHOS ────────────────────────────────────────────────────────────
async function handleFalhos(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const failed = await prisma.video.findMany({
    where: { status: 'failed' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { id: true, title: true, channelName: true, url: true, errorMessage: true },
  });

  if (failed.length === 0) {
    await interaction.editReply('✅ Nenhum vídeo com falha!');
    return;
  }

  const list = failed.map((v, i) => {
    const err = v.errorMessage ? `\n   └ _${v.errorMessage}_` : '';
    return `\`${i + 1}.\` **${v.title}** — _${v.channelName}_${err}`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0xFF4444)
    .setTitle('❌ Vídeos com Falha')
    .setDescription(list)
    .setTimestamp();

  // Botão de retry all
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('wl_retry_all')
      .setLabel('Reprocessar Todos')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ─── AUTOPILOT START ───────────────────────────────────────────────────
async function handleAutopilotStart(interaction: ButtonInteraction, intervalMinutes: number): Promise<void> {
  await interaction.deferReply();

  const channelId = interaction.channelId;
  const client = interaction.client;

  await startAutopilot(client, channelId, intervalMinutes);

  const embed = new EmbedBuilder()
    .setColor(0x00FF88)
    .setTitle('🤖 Autopilot — LIGADO')
    .setDescription(
      `O agente vai processar **1 vídeo a cada ${intervalMinutes} minutos** automaticamente.\n\n` +
      `📍 Canal: <#${channelId}>\n` +
      `⏱️ Intervalo: **${intervalMinutes} min**\n` +
      `🔄 Primeiro vídeo sendo processado agora...`
    )
    .addFields(
      { name: '🛑 Para desligar', value: 'Clique em "Desligar Auto" no `/painel`', inline: false },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ─── AUTOPILOT STOP ────────────────────────────────────────────────────
async function handleAutopilotStop(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();

  const status = getAutopilotStatus();
  stopAutopilot();

  const embed = await buildPainelEmbed();
  const components = buildPainelButtons();

  await interaction.editReply({ embeds: [embed], components });

  await interaction.followUp({
    content: `🛑 **Autopilot desligado.** Processou **${status.processedCount}** vídeo(s) nesta sessão.`,
    ephemeral: false,
  });
}

// ─── RETRY ALL ─────────────────────────────────────────────────────────
async function handleRetryAll(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply();

  const failedVideos = await prisma.video.findMany({
    where: { status: 'failed' },
  });

  if (failedVideos.length === 0) {
    await interaction.editReply('✅ Nenhum vídeo com falha para reprocessar.');
    return;
  }

  // Reset status para pending
  await prisma.video.updateMany({
    where: { status: 'failed' },
    data: { status: 'pending', errorMessage: null },
  });

  await interaction.editReply(
    `🔁 **${failedVideos.length}** vídeo(s) marcado(s) como pendente(s) para reprocessamento.\n` +
    `Use a Fila ou o Autopilot para processá-los.`
  );
}
