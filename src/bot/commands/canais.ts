import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { BotCommand } from './index.js';
import { prisma } from '../../db/client.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:canais');

export const canaisCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('canais')
    .setDescription('Mostra o ranking dos canais mais assistidos/processados.') as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      const videos = await prisma.video.groupBy({
        by: ['channelName'],
        where: { status: 'done' },
        _count: { channelName: true },
        orderBy: { _count: { channelName: 'desc' } },
        take: 10,
      });

      if (videos.length === 0) {
        await interaction.editReply('📊 Nenhum vídeo processado ainda para gerar estatísticas.');
        return;
      }

      const totalDone = await prisma.video.count({ where: { status: 'done' } });

      const embed = new EmbedBuilder()
        .setColor(0xFF00AA)
        .setTitle('🏆 Ranking de Canais')
        .setDescription(`Top 10 canais baseados em **${totalDone}** vídeos já processados:`);

      let textList = '';
      videos.forEach((v, index) => {
        const percentage = Math.round((v._count.channelName / totalDone) * 100);
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '▪️';
        textList += `${medal} **${v.channelName}** — ${v._count.channelName} vídeos (${percentage}%)\n`;
      });

      embed.addFields({ name: '\u200B', value: textList });

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      log.error({ err: error.message }, 'Erro no /canais');
      await interaction.editReply(`❌ Erro ao buscar canais: ${error.message}`);
    }
  },
};
