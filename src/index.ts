import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { initLogger, getLogger } from './utils/logger.js';
import { prisma, disconnectDb } from './db/client.js';
import { createBot, startBot } from './bot/client.js';

/**
 * 🧠 Watch Later Agent — Entry Point
 * 
 * Segundo Cérebro: monitora sua playlist "Assistir Mais Tarde" do YouTube,
 * extrai transcrições, sintetiza conhecimento via LLM e entrega via Discord.
 */
async function main(): Promise<void> {
  // 1. Carregar configuração (fail-fast se .env está incompleto)
  const config = loadConfig();

  // 2. Inicializar logger
  const log = initLogger();

  log.info('╔══════════════════════════════════════════════════╗');
  log.info('║       🧠 Watch Later Agent — Segundo Cérebro     ║');
  log.info('╚══════════════════════════════════════════════════╝');

  // 3. Verificar conexão com banco
  try {
    await prisma.$connect();
    log.info('📦 Banco de dados SQLite conectado');
  } catch (error: any) {
    log.fatal({ err: error.message }, 'Falha ao conectar ao banco de dados');
    log.info('💡 Execute: npx prisma migrate dev --name init');
    process.exit(1);
  }

  // 4. Inicializar WhatsApp (se ativado)
  if (config.WHATSAPP_ENABLED) {
    try {
      const { initWhatsApp, disconnectWhatsApp } = await import('./services/whatsapp/client.js');
      const { sendDailyDigestWhatsApp } = await import('./services/whatsapp/sender.js');
      
      await initWhatsApp();
      
      // Agendar digest se modo for digest
      if (config.WHATSAPP_MODE === 'digest') {
        // Enviar digest todo dia às 20h
        setInterval(() => {
          const now = new Date();
          if (now.getHours() === 20 && now.getMinutes() === 0) {
            sendDailyDigestWhatsApp().catch(err => {
              log.error({ err: err.message }, 'Falha ao enviar digest diário');
            });
          }
        }, 60 * 1000); // Check every minute
        log.info('🕒 Agendamento de WhatsApp Digest configurado para 20:00');
      }
    } catch (error: any) {
      log.error({ err: error.message }, 'Falha ao inicializar integração WhatsApp');
    }
  }

  // 5. Criar e iniciar o bot Discord
  try {
    const client = await createBot();
    await startBot(client);
    log.info(`🔧 LLM Provider: ${config.LLM_PROVIDER}`);
    log.info(`🌐 Cookies Browser: ${config.COOKIES_BROWSER}`);
    log.info(`📱 WhatsApp: ${config.WHATSAPP_ENABLED ? (config.WHATSAPP_MODE === 'digest' ? 'Ativado (Digest)' : 'Ativado (Sempre)') : 'Desativado'}`);
    log.info('✅ Agente pronto. Aguardando comandos no Discord...');
  } catch (error: any) {
    log.fatal({ err: error.message }, 'Falha ao iniciar bot Discord');
    log.info('💡 Verifique DISCORD_TOKEN no .env');
    await disconnectDb();
    process.exit(1);
  }

  // 6. Graceful shutdown
  const shutdown = async (signal: string) => {
    const log = getLogger();
    log.info(`\n🛑 Recebido ${signal}. Desligando...`);
    
    if (config.WHATSAPP_ENABLED) {
      const { disconnectWhatsApp } = await import('./services/whatsapp/client.js');
      await disconnectWhatsApp();
    }
    
    await disconnectDb();
    log.info('👋 Até mais!');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Capturar erros não tratados
  process.on('unhandledRejection', (reason) => {
    const log = getLogger();
    log.error({ reason }, 'Unhandled Rejection');
  });

  process.on('uncaughtException', (error) => {
    const log = getLogger();
    log.fatal({ err: error }, 'Uncaught Exception');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
