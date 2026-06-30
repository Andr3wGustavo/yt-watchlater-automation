import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { syncLikedToDb } from '../../services/youtube/liked-reader.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:sync-curtidos');

export const syncCurtidosCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    await interaction.editReply('🔄 Sincronizando playlist de Curtidos... Isso pode levar alguns minutos.');

    try {
      const startTime = Date.now();
      const result = await syncLikedToDb();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Barras de proporção
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
        .setTimestamp()
        .setFooter({ text: 'Watch Later Agent • Curtidos' });

      await interaction.editReply({ content: null, embeds: [embed] });
    } catch (error: any) {
      log.error({ err: error.message }, 'Erro no /sync-curtidos');
      await interaction.editReply(`❌ Erro ao sincronizar curtidos: ${error.message}`);
    }
  },
};
