import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser } from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';
import { getConfig } from '../../config/env.js';

//@ts-ignore
puppeteer.use(StealthPlugin());

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CHROME_PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');

/**
 * Script de setup interativo de autenticação.
 * 
 * Abre um browser headed (visível) para o usuário fazer login no YouTube.
 * O perfil do Chrome é salvo em data/chrome-profile/ para uso futuro
 * pelo Puppeteer em modo headless.
 * 
 * Uso: npm run setup
 */
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║    🧠 Watch Later Agent — Setup de Autenticação  ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  1. Um navegador vai abrir                      ║');
  console.log('║  2. Faça login na sua conta Google/YouTube       ║');
  console.log('║  3. Acesse: youtube.com/playlist?list=WL         ║');
  console.log('║  4. Confirme que a playlist carregou             ║');
  console.log('║  5. Feche o navegador quando terminar            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();

  // Garantir que o diretório data existe
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

  let config;
  try {
    const { loadConfig } = await import('../../config/env.js');
    config = loadConfig();
  } catch {
    // Config pode não estar completa no setup inicial — ok
    config = null;
  }

  const launchOptions: any = {
    headless: false,
    userDataDir: CHROME_PROFILE_DIR,
    defaultViewport: null,  // usar tamanho da janela
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized',
    ],
  };

  if (config?.CHROME_EXECUTABLE_PATH) {
    launchOptions.executablePath = config.CHROME_EXECUTABLE_PATH;
  }

  console.log('🚀 Abrindo navegador...\n');

  const browser = await //@ts-ignore
puppeteer.launch(launchOptions) as unknown as Browser;
  const page = await browser.newPage();

  // Navegar para YouTube
  await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2' });

  console.log('📌 Navegador aberto. Faça login no YouTube.');
  console.log('📌 Depois de logado, acesse: youtube.com/playlist?list=WL');
  console.log('📌 Feche o navegador quando terminar.\n');

  // Aguardar o browser ser fechado pelo usuário
  await new Promise<void>((resolve) => {
    browser.on('disconnected', () => {
      resolve();
    });
  });

  console.log('');
  console.log('✅ Perfil do Chrome salvo em: data/chrome-profile/');
  console.log('✅ O bot agora pode acessar sua playlist em modo headless.');
  console.log('');
  console.log('💡 Próximo passo: configure o .env e execute: npm run dev');
}

main().catch((err) => {
  console.error('❌ Erro no setup:', err.message);
  process.exit(1);
});
