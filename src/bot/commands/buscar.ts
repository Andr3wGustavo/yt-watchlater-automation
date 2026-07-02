import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { prisma } from '../../db/client.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:buscar');

export const buscarCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('buscar')
    .setDescription('Busca vídeos processados no seu Segundo Cérebro (por título, canal ou tag).')
    .addStringOption(option =>
      option
        .setName('termo')
        .setDescription('Termo ou #tag para pesquisar')
        .setRequired(true)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const termo = interaction.options.getString('termo', true).trim();
    
    await interaction.deferReply();

    try {
      const videos = await prisma.video.findMany({
        where: {
          status: 'done',
          OR: [
            { title: { contains: termo } },
            { channelName: { contains: termo } },
            { tags: { contains: termo } },
          ]
        },
        orderBy: { processedAt: 'desc' },
        take: 10,
      });

      if (videos.length === 0) {
        await interaction.editReply(`🔍 Nenhum vídeo encontrado contendo **"${termo}"**.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x00AFFF)
        .setTitle(`🔍 Resultados da Busca: "${termo}"`)
        .setDescription(`Encontrei ${videos.length} vídeo(s) processado(s):`);

      videos.forEach((v, index) => {
        const shortTags = v.tags ? v.tags.split(',').slice(0, 3).join(', ') : 'sem tags';
        embed.addFields({
          name: `${index + 1}. ${v.title}`,
          value: `📺 **Canal:** ${v.channelName}\n🏷️ **Tags:** ${shortTags}\n🔗 [Assistir Original](${v.url}) | ID: \`${v.youtubeId}\``,
          inline: false,
        });
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      log.error({ termo, err: error.message }, 'Erro no /buscar');
      await interaction.editReply(`❌ Erro ao buscar vídeos: ${error.message}`);
    }
  },
};
