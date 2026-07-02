import { SlashCommandBuilder, type ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { prisma } from '../../db/client.js';
import { processVideoFromDb } from '../../services/pipeline/processor.js';
import { extractVideoId } from '../../utils/helpers.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:reprocessar');

export const reprocessarCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('reprocessar')
    .setDescription('Reprocessa um vídeo pelo LLM. Útil se mudou o prompt ou o vídeo falhou.')
    .addStringOption(option =>
      option
        .setName('url')
        .setDescription('URL ou ID do vídeo do YouTube')
        .setRequired(true)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const urlInput = interaction.options.getString('url', true);
    const videoId = extractVideoId(urlInput);

    if (!videoId) {
      await interaction.reply({
        content: '❌ URL inválida. Use um link do YouTube ou um ID de vídeo (11 caracteres).',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    await interaction.editReply('⏳ Reprocessando vídeo... Isso pode levar alguns minutos.');

    try {
      let video = await prisma.video.findUnique({
        where: { youtubeId: videoId }
      });

      if (!video) {
        await interaction.editReply(`❌ Vídeo \`${videoId}\` não encontrado no banco de dados. Use \`/processar\` para novos vídeos.`);
        return;
      }

      // Voltar status para pending para forçar reprocessamento
      await prisma.video.update({
        where: { id: video.id },
        data: { status: 'pending', retryCount: 0 }
      });

      const result = await processVideoFromDb(video.id);

      if (result.status === 'success' && result.markdownPath) {
        const fs = await import('node:fs');
        const path = await import('node:path');

        const fileBuffer = fs.readFileSync(result.markdownPath);
        const fileName = path.basename(result.markdownPath);
        const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

        await interaction.editReply({
          content: `✅ **${result.title}** reprocessado com sucesso!`,
          files: [attachment],
        });
      } else {
        await interaction.editReply(`❌ Falha ao reprocessar vídeo.\nErro: ${result.error}`);
      }
    } catch (error: any) {
      log.error({ videoId, err: error.message }, 'Erro no /reprocessar');
      await interaction.editReply(`❌ Erro inesperado: ${error.message}`);
    }
  },
};
