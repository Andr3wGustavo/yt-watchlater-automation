import { SlashCommandBuilder, type ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { prisma } from '../../db/client.js';
import { processVideoFromDb } from '../../services/pipeline/processor.js';
import { syncPlaylistToDb } from '../../services/youtube/playlist-reader.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:fila');

const MAX_BATCH_SIZE = 10;

export const filaCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const quantidade = interaction.options.getInteger('quantidade') ?? 5;

    await interaction.deferReply();

    try {
      // Garantir sync
      const pendingCount = await prisma.video.count({ where: { status: 'pending' } });

      if (pendingCount === 0) {
        await interaction.editReply('🔄 Nenhum vídeo pendente. Sincronizando playlist...');
        await syncPlaylistToDb();
      }

      // Buscar os N mais antigos
      const videos = await prisma.video.findMany({
        where: { status: 'pending' },
        orderBy: { discoveredAt: 'asc' },
        take: quantidade,
      });

      if (videos.length === 0) {
        await interaction.editReply('📭 Nenhum vídeo pendente para processar.');
        return;
      }

      const total = videos.length;
      await interaction.editReply(
        `🚀 Iniciando processamento de **${total}** vídeo(s)...\n` +
        videos.map((v, i) => `${i + 1}. ${v.title}`).join('\n'),
      );

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];

        // Reportar progresso
        await interaction.editReply(
          `⏳ Processando **${i + 1}/${total}**: ${video.title}\n\n` +
          `✅ Sucesso: ${successCount} | ❌ Falha: ${failCount}`,
        );

        try {
          const result = await processVideoFromDb(video.id);

          if (result.status === 'success' && result.markdownPath) {
            const fs = await import('node:fs');
            const path = await import('node:path');

            const fileBuffer = fs.readFileSync(result.markdownPath);
            const fileName = path.basename(result.markdownPath);
            const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

            // Enviar cada .md como followUp separado
            await interaction.followUp({
              content: `📄 **[${i + 1}/${total}]** ${result.title}`,
              files: [attachment],
            });

            successCount++;
          } else {
            failCount++;
            await interaction.followUp({
              content: `❌ **[${i + 1}/${total}]** ${video.title}: ${result.error}`,
            });
          }
        } catch (error: any) {
          failCount++;
          log.error({ videoId: video.id, err: error.message }, 'Erro ao processar na fila');
          await interaction.followUp({
            content: `❌ **[${i + 1}/${total}]** ${video.title}: ${error.message}`,
          });
        }
      }

      // Resumo final
      await interaction.followUp(
        `\n🏁 **Fila concluída!**\n` +
        `✅ Sucesso: ${successCount}/${total}\n` +
        `❌ Falhas: ${failCount}/${total}`,
      );
    } catch (error: any) {
      log.error({ err: error.message }, 'Erro no /processar-fila');
      await interaction.editReply(`❌ Erro ao processar fila: ${error.message}`);
    }
  },
};
