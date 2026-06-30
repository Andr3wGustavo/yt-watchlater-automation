import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { syncPlaylistToDb } from '../../services/youtube/playlist-reader.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:sync');

export const syncCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    await interaction.editReply('🔄 Sincronizando playlist Watch Later...');

    try {
      const startTime = Date.now();
      const result = await syncPlaylistToDb();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      const embed = new EmbedBuilder()
        .setColor(result.newVideos > 0 ? 0x00FF88 : 0x3498DB)
        .setTitle('🔄 Sync Concluído')
        .addFields(
          { name: '📺 Total na Playlist', value: `${result.totalInPlaylist}`, inline: true },
          { name: '🆕 Novos Vídeos', value: `${result.newVideos}`, inline: true },
          { name: '⏱️ Tempo', value: `${elapsed}s`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Watch Later Agent' });

      const message = result.newVideos > 0
        ? `✅ **${result.newVideos}** novo(s) vídeo(s) encontrado(s)!`
        : '✅ Playlist sincronizada. Nenhum vídeo novo.';

      await interaction.editReply({ content: message, embeds: [embed] });
    } catch (error: any) {
      log.error({ err: error.message }, 'Erro no /sync');
      await interaction.editReply(`❌ Erro ao sincronizar: ${error.message}`);
    }
  },
};
