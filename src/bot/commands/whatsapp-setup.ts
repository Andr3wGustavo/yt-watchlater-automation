import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import qrcodeTerminal from 'qrcode-terminal';
import type { BotCommand } from './index.js';
import { getWhatsAppStatus, onQRCode, initWhatsApp } from '../../services/whatsapp/client.js';
import { getConfig } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('cmd:whatsapp');

export const whatsappSetupCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const config = getConfig();
    if (!config.WHATSAPP_ENABLED) {
      await interaction.reply({
        content: '❌ WhatsApp está desabilitado no `.env` (WHATSAPP_ENABLED=false)',
        ephemeral: true,
      });
      return;
    }

    const { connected } = getWhatsAppStatus();
    if (connected) {
      await interaction.reply({
        content: '✅ O WhatsApp já está conectado! Os resumos serão enviados para o grupo configurado.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    await interaction.editReply('⏳ Iniciando conexão com WhatsApp... Aguarde o QR Code.');

    // Capturar o QR code quando for gerado pelo Baileys
    onQRCode(async (qr) => {
      // Como não podemos desenhar facilmente o QR code inteiro como imagem no Discord sem uma lib extra (como qrcode-image),
      // vamos desenhar no terminal (útil para quem roda localmente)
      qrcodeTerminal.generate(qr, { small: true });

      const embed = new EmbedBuilder()
        .setColor(0x25D366)
        .setTitle('📱 WhatsApp — Setup')
        .setDescription(
          '**Escaneie o QR Code no terminal!**\n\n' +
          'Abra o WhatsApp no celular > Configurações > Aparelhos Conectados > Conectar um aparelho.\n\n' +
          '_Nota: Por limitações técnicas, o QR code foi gerado no console/terminal onde o bot está rodando._'
        )
        .setFooter({ text: 'Watch Later Agent • WhatsApp' });

      try {
        await interaction.editReply({ content: null, embeds: [embed] });
      } catch (err) {
        log.warn('Falha ao atualizar resposta com QR code instructions');
      }
    });

    // Iniciar a conexão
    // Se der sucesso, o evento connection.update lá no client.ts vai logar
    initWhatsApp().catch(err => {
      log.error({ err: err.message }, 'Erro ao iniciar setup do WhatsApp');
    });
  },
};

export const whatsappCommand: BotCommand = {
  data: (new SlashCommandBuilder()) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const modo = interaction.options.getString('modo') as 'always' | 'digest';

    // Salvar no DB para persistir a escolha (já que env.ts lê de lá ou do .env)
    // Para simplificar, vamos atualizar o AppState
    await prisma.appState.upsert({
      where: { key: 'whatsappMode' },
      update: { value: modo },
      create: { key: 'whatsappMode', value: modo },
    });

    // Nota: O ideal seria o env.ts reler essa config dinamicamente ou termos uma classe ConfigManager,
    // mas vamos avisar o usuário que pode precisar reiniciar se basear no env, ou o client ler do DB direto.
    // Para nosso MVP, vamos assumir que o bot lê do banco dinamicamente ou o env é só valor inicial.

    const modoText = modo === 'always' ? 'Sempre (cada vídeo)' : 'Digest (1 vez por dia)';

    const embed = new EmbedBuilder()
      .setColor(0x25D366)
      .setTitle('📱 WhatsApp Configurado')
      .setDescription(`Modo de notificação alterado para: **${modoText}**`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
