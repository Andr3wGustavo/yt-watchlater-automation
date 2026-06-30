import { REST, Routes } from 'discord.js';
import { loadCommands } from './commands/index.js';
import { loadConfig } from '../config/env.js';
import 'dotenv/config';

/**
 * Script para registrar/atualizar os slash commands no Discord.
 * 
 * Uso: npm run deploy-commands
 * 
 * Deve ser executado toda vez que um comando for adicionado ou modificado.
 * Os comandos são registrados na guild específica (instantâneo, sem delay).
 */
async function main(): Promise<void> {
  // Carregar variáveis de ambiente manualmente (este script roda standalone)
  const config = loadConfig();

  const commands = loadCommands();
  const commandData = commands.map((cmd) => cmd.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  console.log(`🔄 Registrando ${commandData.length} slash command(s)...`);

  try {
    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
      { body: commandData },
    );

    console.log('✅ Slash commands registrados com sucesso:');
    for (const cmd of commandData) {
      console.log(`   /${cmd.name} — ${cmd.description}`);
    }
  } catch (error: any) {
    console.error('❌ Erro ao registrar comandos:', error.message);
    process.exit(1);
  }
}

main();
