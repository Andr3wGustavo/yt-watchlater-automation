import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { prisma } from '../../db/client.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:status');

export const statusCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      // Contar vídeos por status
      const [total, pending, processing, done, failed, skipped, removed] = await Promise.all([
        prisma.video.count(),
        prisma.video.count({ where: { status: 'pending' } }),
        prisma.video.count({ where: { status: 'processing' } }),
        prisma.video.count({ where: { status: 'done' } }),
        prisma.video.count({ where: { status: 'failed' } }),
        prisma.video.count({ where: { status: 'skipped' } }),
        prisma.video.count({ where: { removedFromWL: true } }),
      ]);

      // Último sync
      const lastSync = await prisma.appState.findUnique({ where: { key: 'lastSyncAt' } });
      const lastSyncStr = lastSync
        ? new Date(lastSync.value).toLocaleString('pt-BR')
        : 'Nunca';

      // Últimos 5 vídeos processados
      const recentDone = await prisma.video.findMany({
        where: { status: 'done' },
        orderBy: { processedAt: 'desc' },
        take: 5,
        select: { title: true, processedAt: true, channelName: true },
      });

      const recentList = recentDone.length > 0
        ? recentDone.map((v, i) =>
            `${i + 1}. **${v.title}** (${v.channelName})`
          ).join('\n')
        : '_Nenhum vídeo processado ainda._';

      // Barra de progresso visual
      const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;
      const progressBar = generateProgressBar(progressPercent);

      const embed = new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle('🧠 Watch Later Agent — Status')
        .setDescription(`${progressBar} ${progressPercent}% consumido`)
        .addFields(
          { name: '📊 Total de Vídeos', value: `${total}`, inline: true },
          { name: '⏳ Pendentes', value: `${pending}`, inline: true },
          { name: '🔄 Processando', value: `${processing}`, inline: true },
          { name: '✅ Concluídos', value: `${done}`, inline: true },
          { name: '❌ Falhos', value: `${failed}`, inline: true },
          { name: '⏭️ Pulados', value: `${skipped}`, inline: true },
          { name: '🗑️ Removidos da WL', value: `${removed}`, inline: true },
          { name: '🔄 Último Sync', value: lastSyncStr, inline: true },
          { name: '\u200B', value: '\u200B', inline: true }, // spacer
          { name: '📝 Últimos Processados', value: recentList, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: 'Watch Later Agent • Segundo Cérebro' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      log.error({ err: error.message }, 'Erro no /status');
      await interaction.editReply(`❌ Erro ao buscar status: ${error.message}`);
    }
  },
};

/**
 * Gera uma barra de progresso visual com emoji.
 */
function generateProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '🟩'.repeat(filled) + '⬜'.repeat(empty);
}
