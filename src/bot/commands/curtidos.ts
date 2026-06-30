import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { getLikedAnalytics } from '../../services/youtube/liked-reader.js';
import { formatDuration } from '../../utils/helpers.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:curtidos');

export const curtidosCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      const tipoOption = interaction.options.getString('tipo') || 'all';
      const filterType = tipoOption === 'all' ? undefined : tipoOption as 'short' | 'video';

      const analytics = await getLikedAnalytics(filterType);

      if (analytics.total === 0) {
        await interaction.editReply(
          '📭 Nenhum vídeo curtido encontrado no banco.\n💡 Execute `/sync-curtidos` primeiro!',
        );
        return;
      }

      // Emoji e título baseado no filtro
      const titleEmoji = filterType === 'short' ? '📱' : filterType === 'video' ? '🎬' : '❤️';
      const titleText = filterType === 'short' ? 'Shorts Curtidos' : filterType === 'video' ? 'Vídeos Curtidos' : 'Curtidos — Análise Completa';

      // Top canais com barras visuais
      const maxCount = analytics.topChannels[0]?.count || 1;
      const topChannelsList = analytics.topChannels.length > 0
        ? analytics.topChannels.map((ch, i) => {
            const barLength = Math.max(1, Math.round((ch.count / maxCount) * 15));
            const bar = '█'.repeat(barLength);
            return `\`${i + 1}.\` \`${bar}\` **${ch.channelName}** (${ch.count})`;
          }).join('\n')
        : '_Nenhum dado_';

      // Últimos curtidos
      const recentList = analytics.recent.length > 0
        ? analytics.recent.map((v, i) => {
            const typeEmoji = v.videoType === 'short' ? '📱' : '🎬';
            const dur = v.duration ? formatDuration(v.duration) : '??';
            return `\`${i + 1}.\` ${typeEmoji} [${v.title}](${v.url}) — _${v.channelName}_ (${dur})`;
          }).join('\n')
        : '_Nenhum vídeo_';

      // Proporção shorts vs vídeos
      const totalClassified = analytics.shorts + analytics.videos;
      const shortPercent = totalClassified > 0 ? Math.round((analytics.shorts / totalClassified) * 100) : 0;
      const videoPercent = 100 - shortPercent;

      const embed = new EmbedBuilder()
        .setColor(filterType === 'short' ? 0xFF6B9D : filterType === 'video' ? 0x3498DB : 0xFF4466)
        .setTitle(`${titleEmoji} ${titleText}`)
        .setDescription(
          !filterType
            ? `Total: **${analytics.total}** vídeos curtidos\n` +
              `📱 Shorts: **${analytics.shorts}** (${shortPercent}%) │ 🎬 Vídeos: **${analytics.videos}** (${videoPercent}%)`
            : `Total: **${analytics.total}** ${filterType === 'short' ? 'shorts' : 'vídeos'} curtidos`
        )
        .addFields(
          {
            name: '🏆 Top Canais',
            value: topChannelsList,
            inline: false,
          },
          {
            name: '⏱️ Tempo Total',
            value: analytics.totalDuration > 0 ? `**${formatDuration(analytics.totalDuration)}**` : 'N/A',
            inline: true,
          },
          {
            name: '📊 Média de Duração',
            value: analytics.avgDuration > 0 ? `**${formatDuration(analytics.avgDuration)}**` : 'N/A',
            inline: true,
          },
          { name: '\u200B', value: '\u200B', inline: true },
          {
            name: '🕐 Últimos Curtidos',
            value: recentList,
            inline: false,
          },
        )
        .setTimestamp()
        .setFooter({ text: 'Watch Later Agent • Curtidos' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      log.error({ err: error.message }, 'Erro no /curtidos');
      await interaction.editReply(`❌ Erro ao buscar analytics: ${error.message}`);
    }
  },
};
