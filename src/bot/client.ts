import {
  Client,
  Events,
  GatewayIntentBits,
  Collection,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { createChildLogger } from '../utils/logger.js';
import { getConfig } from '../config/env.js';
import { loadCommands, type BotCommand } from './commands/index.js';
import { handleButtonInteraction } from './handlers/buttons.js';

const log = createChildLogger('discord');

// Estende o Client para incluir a collection de comandos
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, BotCommand>;
  }
}

/**
 * Cria e configura o client do Discord.js com todos os slash commands e botões.
 */
export async function createBot(): Promise<Client> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  // Registrar comandos na collection do client
  client.commands = new Collection();
  const commands = loadCommands();

  for (const command of commands) {
    client.commands.set(command.data.name, command);
    log.debug({ command: command.data.name }, 'Comando registrado');
  }

  // Event: Bot pronto
  client.once(Events.ClientReady, (readyClient) => {
    log.info(`🤖 Bot online como: ${readyClient.user.tag}`);
    log.info(`📡 Servindo ${readyClient.guilds.cache.size} guild(s)`);
  });

  // Event: Interação recebida (slash commands + botões)
  client.on(Events.InteractionCreate, async (interaction) => {
    // ─── Botões do painel ──────────────────────────────────────
    if (interaction.isButton()) {
      try {
        log.info(
          { button: interaction.customId, user: interaction.user.tag },
          'Botão clicado'
        );
        await handleButtonInteraction(interaction);
      } catch (error: any) {
        log.error({ button: interaction.customId, err: error.message }, 'Erro no botão');
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: `❌ Erro: ${error.message}`, ephemeral: true });
          } else {
            await interaction.reply({ content: `❌ Erro: ${error.message}`, ephemeral: true });
          }
        } catch {
          log.error('Falha ao enviar erro do botão ao Discord');
        }
      }
      return;
    }

    // ─── Slash commands ────────────────────────────────────────
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      log.warn({ command: interaction.commandName }, 'Comando não encontrado');
      return;
    }

    try {
      log.info(
        { command: interaction.commandName, user: interaction.user.tag },
        'Executando comando'
      );
      await command.execute(interaction);
    } catch (error: any) {
      log.error(
        { command: interaction.commandName, err: error.message },
        'Erro ao executar comando'
      );

      const errorMessage = '❌ Ocorreu um erro ao executar esse comando.';

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch {
        // Se nem o reply de erro funcionar, só loga
        log.error('Falha ao enviar mensagem de erro ao Discord');
      }
    }
  });

  return client;
}

/**
 * Conecta o bot ao Discord.
 */
export async function startBot(client: Client): Promise<void> {
  const config = getConfig();
  await client.login(config.DISCORD_TOKEN);
}
