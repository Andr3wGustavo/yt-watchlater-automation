import { SlashCommandBuilder, type ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { processVideo } from '../../services/pipeline/processor.js';
import { extractVideoId } from '../../utils/helpers.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:processar');

export const processarCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

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

    // Defer reply (pode demorar)
    await interaction.deferReply();
    await interaction.editReply('⏳ Processando vídeo... Isso pode levar alguns minutos.');

    try {
      const result = await processVideo(videoId);

      if (result.status === 'success' && result.markdownPath) {
        const fs = await import('node:fs');
        const path = await import('node:path');

        const fileBuffer = fs.readFileSync(result.markdownPath);
        const fileName = path.basename(result.markdownPath);

        const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

        const message = await interaction.editReply({
          content: `✅ **${result.title}** processado com sucesso!\n🗑️ Vídeo removido da WL.`,
        });

        try {
          const threadName = (result.title || 'Resumo do Vídeo').substring(0, 95);
          const thread = await message.startThread({
            name: threadName,
            autoArchiveDuration: 1440,
          });
          await thread.send({ content: '📄 Aqui está o documento com os insights completos:', files: [attachment] });
        } catch (err: any) {
          log.warn({ err: err.message }, 'Não foi possível criar a thread, enviando no canal principal.');
          await interaction.followUp({ content: '📄 Resumo completo:', files: [attachment] });
        }
      } else if (result.status === 'partial') {
        await interaction.editReply(
          `⚠️ **${result.title}** processado parcialmente.\n` +
          `Resumo gerado, mas houve erro na remoção da WL.\n` +
          `Erro: ${result.error}`,
        );
      } else {
        await interaction.editReply(
          `❌ Falha ao processar vídeo.\nErro: ${result.error}`,
        );
      }
    } catch (error: any) {
      log.error({ videoId, err: error.message }, 'Erro no /processar');
      await interaction.editReply(`❌ Erro inesperado: ${error.message}`);
    }
  },
};
