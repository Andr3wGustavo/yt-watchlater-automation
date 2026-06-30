import { z } from 'zod';

const envSchema = z.object({
  // Discord
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN é obrigatório'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID é obrigatório'),
  DISCORD_GUILD_ID: z.string().min(1, 'DISCORD_GUILD_ID é obrigatório'),

  // LLM
  LLM_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  GEMINI_API_KEY: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),

  // YouTube / Browser
  CHROME_EXECUTABLE_PATH: z.string().optional().default(''),
  COOKIES_BROWSER: z.enum(['chrome', 'brave', 'firefox', 'edge']).default('chrome'),

  // Database
  DATABASE_URL: z.string().default('file:./data/watchlater.db'),

  // WhatsApp
  WHATSAPP_ENABLED: z.string().transform(v => v === 'true').default('false'),
  WHATSAPP_GROUP_NAME: z.string().optional().default(''),
  WHATSAPP_MODE: z.enum(['always', 'digest']).default('always'),

  // App
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SUMMARY_LANGUAGE: z.string().default('pt-BR'),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Configuração inválida:');
    for (const issue of result.error.issues) {
      console.error(`   → ${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('\n💡 Copie .env.example para .env e preencha os valores.');
    process.exit(1);
  }

  // Validação condicional: se o provider é gemini, a key precisa existir
  if (result.data.LLM_PROVIDER === 'gemini' && !result.data.GEMINI_API_KEY) {
    console.error('❌ LLM_PROVIDER=gemini mas GEMINI_API_KEY não foi definida.');
    process.exit(1);
  }

  if (result.data.LLM_PROVIDER === 'openai' && !result.data.OPENAI_API_KEY) {
    console.error('❌ LLM_PROVIDER=openai mas OPENAI_API_KEY não foi definida.');
    process.exit(1);
  }

  _config = result.data;
  return _config;
}

export function getConfig(): Config {
  if (!_config) {
    throw new Error('Config não carregada. Chame loadConfig() primeiro.');
  }
  return _config;
}
