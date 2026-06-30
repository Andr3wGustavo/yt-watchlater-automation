import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import { createChildLogger } from '../../utils/logger.js';
import { getConfig } from '../../config/env.js';
import { humanDelay } from '../../utils/helpers.js';
import { prisma } from '../../db/client.js';
import path from 'node:path';

//@ts-ignore
puppeteer.use(StealthPlugin());

const log = createChildLogger('video-remover');
const DATA_DIR = path.resolve(process.cwd(), 'data');
const CHROME_PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');
const WL_URL = 'https://www.youtube.com/playlist?list=WL';

/**
 * Cria uma instância do browser Puppeteer com stealth e perfil persistente.
 */
async function launchBrowser(headless: boolean = true): Promise<Browser> {
  const config = getConfig();

  const launchOptions: any = {
    headless: headless ? true : false,
    userDataDir: CHROME_PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
  };

  if (config.CHROME_EXECUTABLE_PATH) {
    launchOptions.executablePath = config.CHROME_EXECUTABLE_PATH;
  }

  // @ts-ignore
  const browser = await puppeteer.launch(launchOptions);
  return browser as unknown as Browser;
}

/**
 * Remove um vídeo da playlist "Assistir Mais Tarde" via interação DOM.
 * 
 * Fluxo:
 * 1. Navega para a playlist WL
 * 2. Encontra o vídeo pelo título
 * 3. Clica no menu ⋮ (três pontos)
 * 4. Clica em "Remover da playlist Assistir mais tarde"
 * 5. Confirma remoção
 */
export async function removeVideoFromWL(youtubeId: string, videoTitle: string): Promise<boolean> {
  log.info({ youtubeId, title: videoTitle }, 'Iniciando remoção da WL via Puppeteer...');

  let browser: Browser | null = null;

  try {
    browser = await launchBrowser(true);
    const page = await browser.newPage();

    // Configurar viewport e user agent realista
    await page.setViewport({ width: 1920, height: 1080 });

    // Navegar para a playlist Watch Later
    log.debug('Navegando para a playlist WL...');
    await page.goto(WL_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
    await humanDelay(2000, 4000);

    // Verificar se está logado (a playlist WL só aparece logado)
    const isLoggedIn = await page.$('ytd-playlist-video-renderer');
    if (!isLoggedIn) {
      log.error('Não está logado no YouTube. Execute: npm run setup');
      throw new Error('Sessão do YouTube expirada. Execute: npm run setup');
    }

    // Scroll para carregar todos os vídeos (lazy loading)
    await autoScroll(page);
    await humanDelay(1000, 2000);

    // Encontrar o vídeo pelo ID no href dos links
    const videoSelector = `ytd-playlist-video-renderer a[href*="${youtubeId}"]`;
    const videoElement = await page.$(videoSelector);

    if (!videoElement) {
      log.warn({ youtubeId }, 'Vídeo não encontrado na playlist WL (pode já ter sido removido)');
      return false;
    }

    // Encontrar o renderer pai que contém o menu
    const renderer = await videoElement.evaluateHandle(
      (el) => el.closest('ytd-playlist-video-renderer')
    );

    // Hover no vídeo para revelar o menu
    const rendererElement = renderer.asElement();
    if (!rendererElement) {
      throw new Error('Não foi possível encontrar o renderer do vídeo');
    }

    await (rendererElement as any).hover();
    await humanDelay(500, 1000);

    // Clicar no botão de menu (⋮)
    const menuButton = await rendererElement.$('#button[aria-label], yt-icon-button#button, button.yt-icon-button');
    if (!menuButton) {
      // Fallback: tentar pelo ícone de três pontos
      const altMenuButton = await rendererElement.$('ytd-menu-renderer yt-icon-button');
      if (!altMenuButton) {
        throw new Error('Botão de menu não encontrado');
      }
      await altMenuButton.click();
    } else {
      await menuButton.click();
    }

    await humanDelay(800, 1500);

    // Clicar em "Remover da playlist Assistir mais tarde"
    // O texto pode variar por idioma, então buscamos por múltiplos textos
    const removeTexts = [
      'Remover da playlist Assistir mais tarde',
      'Remove from Watch later',
      'Remove from',
      'Remover de',
    ];

    let removed = false;
    for (const text of removeTexts) {
      try {
        const menuItems = await page.$$('ytd-menu-service-item-renderer, tp-yt-paper-item');
        for (const item of menuItems) {
          const itemText = await item.evaluate((el) => el.textContent?.trim() || '');
          if (itemText.toLowerCase().includes(text.toLowerCase())) {
            await item.click();
            removed = true;
            break;
          }
        }
        if (removed) break;
      } catch {
        continue;
      }
    }

    if (!removed) {
      throw new Error('Opção "Remover" não encontrada no menu');
    }

    await humanDelay(1000, 2000);
    log.info({ youtubeId, title: videoTitle }, '✅ Vídeo removido da WL com sucesso');

    return true;

  } catch (error: any) {
    log.error({ youtubeId, err: error.message }, 'Falha ao remover vídeo da WL');
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Remove o vídeo da WL e atualiza o banco de dados.
 */
export async function removeAndMarkVideo(videoDbId: string, youtubeId: string, title: string): Promise<boolean> {
  const startTime = Date.now();

  try {
    const success = await removeVideoFromWL(youtubeId, title);

    if (success) {
      await prisma.video.update({
        where: { id: videoDbId },
        data: { removedFromWL: true },
      });
    }

    await prisma.processingLog.create({
      data: {
        videoId: videoDbId,
        action: 'remove',
        success,
        durationMs: Date.now() - startTime,
      },
    });

    return success;
  } catch (error: any) {
    await prisma.processingLog.create({
      data: {
        videoId: videoDbId,
        action: 'remove',
        success: false,
        durationMs: Date.now() - startTime,
        metadata: JSON.stringify({ error: error.message }),
      },
    });

    throw error;
  }
}

/**
 * Scroll automático para carregar todos os itens da playlist (lazy loading).
 */
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        //@ts-ignore
window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);

      // Safety timeout: máximo 30 segundos de scroll
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 30_000);
    });
  });
}
