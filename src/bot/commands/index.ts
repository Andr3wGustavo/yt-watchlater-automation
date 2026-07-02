import type { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { painelCommand } from './painel.js';
import { processarCommand } from './processar.js';
import { roletaCommand } from './roleta.js';
import { filaCommand } from './fila.js';
import { statusCommand } from './status.js';
import { syncCommand } from './sync.js';
import { syncCurtidosCommand } from './sync-curtidos.js';
import { curtidosCommand } from './curtidos.js';
import { whatsappSetupCommand, whatsappCommand } from './whatsapp-setup.js';
import { pularCommand } from './pular.js';
import { reprocessarCommand } from './reprocessar.js';

/**
 * Interface de um comando do bot.
 */
export interface BotCommand {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

/**
 * Carrega todos os comandos disponíveis.
 * /painel é o comando principal (interface unificada com botões).
 * Os outros continuam existindo como atalhos diretos.
 */
export function loadCommands(): BotCommand[] {
  return [
    painelCommand,
    processarCommand,
    roletaCommand,
    filaCommand,
    statusCommand,
    syncCommand,
    syncCurtidosCommand,
    curtidosCommand,
    whatsappSetupCommand,
    whatsappCommand,
    pularCommand,
    reprocessarCommand,
  ];
}
