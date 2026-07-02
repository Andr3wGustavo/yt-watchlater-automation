import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './index.js';
import { prisma } from '../../db/client.js';
import { extractVideoId } from '../../utils/helpers.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:pular');

export const pularCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('pular')
    .setDescription('Pula um vídeo pendente (marca como skipped) sem processá-lo.')
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

    try {
      const video = await prisma.video.findUnique({
        where: { youtubeId: videoId }
      });

      if (!video) {
        await interaction.editReply(`❌ Vídeo \`${videoId}\` não encontrado no banco de dados.`);
        return;
      }

      if (video.status === 'skipped') {
        await interaction.editReply(`⚠️ O vídeo **${video.title}** já estava marcado como \`skipped\`.`);
        return;
      }

      await prisma.video.update({
        where: { id: video.id },
        data: { status: 'skipped' }
      });

      await interaction.editReply(`⏭️ Vídeo **${video.title}** pulado com sucesso! Não será processado pela fila.`);
    } catch (error: any) {
      log.error({ videoId, err: error.message }, 'Erro no /pular');
      await interaction.editReply(`❌ Erro ao pular vídeo: ${error.message}`);
    }
  },
};
