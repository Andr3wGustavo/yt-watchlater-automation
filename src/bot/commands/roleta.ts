import { SlashCommandBuilder, type ChatInputCommandInteraction, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { prisma } from '../../db/client.js';
import { processVideoFromDb } from '../../services/pipeline/processor.js';
import { syncPlaylistToDb } from '../../services/youtube/playlist-reader.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:roleta');

export const roletaCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      // Garantir que temos dados atualizados
      const pendingCount = await prisma.video.count({ where: { status: 'pending' } });

      if (pendingCount === 0) {
        await interaction.editReply('🔄 Nenhum vídeo pendente. Sincronizando playlist...');
        const sync = await syncPlaylistToDb();

        if (sync.newVideos === 0) {
          await interaction.editReply('📭 Playlist vazia ou sem vídeos novos. Nada para processar!');
          return;
        }
      }

      // Buscar vídeos pendentes, ordenados do mais antigo para o mais novo
      const pendingVideos = await prisma.video.findMany({
        where: { status: 'pending' },
        orderBy: { discoveredAt: 'asc' },
      });

      if (pendingVideos.length === 0) {
        await interaction.editReply('📭 Nenhum vídeo pendente na fila.');
        return;
      }

      // Roleta: peso maior para vídeos mais antigos
      // Usa distribuição ponderada: vídeos mais antigos têm maior chance
      const weights = pendingVideos.map((_, i) => pendingVideos.length - i);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;
      let selectedIndex = 0;

      for (let i = 0; i < weights.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          selectedIndex = i;
          break;
        }
      }

      const selected = pendingVideos[selectedIndex];

      // Mostrar qual vídeo foi sorteado
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🎰 Roleta — Vídeo Sorteado!')
        .setDescription(`**${selected.title}**\n${selected.channelName}`)
        .addFields(
          { name: '🔗 Link', value: selected.url, inline: true },
          { name: '📊 Posição', value: `${selectedIndex + 1}/${pendingVideos.length} pendentes`, inline: true },
        )
        .setTimestamp();

      if (selected.thumbnailUrl) {
        embed.setThumbnail(selected.thumbnailUrl);
      }

      await interaction.editReply({ content: '🎰 Sorteando...', embeds: [embed] });

      // Processar o vídeo
      await interaction.editReply({ content: '⏳ Processando o vídeo sorteado...', embeds: [embed] });

      const result = await processVideoFromDb(selected.id);

      if (result.status === 'success' && result.markdownPath) {
        const fs = await import('node:fs');
        const path = await import('node:path');

        const fileBuffer = fs.readFileSync(result.markdownPath);
        const fileName = path.basename(result.markdownPath);
        const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

        await interaction.editReply({
          content: `✅ **${result.title}** — processado e removido da WL!`,
          embeds: [embed],
          files: [attachment],
        });
      } else {
        await interaction.editReply({
          content: `❌ Falha ao processar: ${result.error}`,
          embeds: [embed],
        });
      }
    } catch (error: any) {
      log.error({ err: error.message }, 'Erro no /roleta');
      await interaction.editReply(`❌ Erro na roleta: ${error.message}`);
    }
  },
};
