import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('whatsapp-formatter');

/**
 * Converte conteúdo Markdown gerado pelo LLM para formato WhatsApp.
 * WhatsApp suporta: *negrito*, _itálico_, ~riscado~, ```monospace```
 */
export function formatForWhatsApp(options: {
  title: string;
  channelName: string;
  url: string;
  duration: string | null;
  isShort: boolean;
  markdownContent: string;
}): string {
  const { title, channelName, url, duration, isShort, markdownContent } = options;

  // Extrair seções do markdown
  const insights = extractSection(markdownContent, isShort ? 'Pontos-Chave' : 'Insights Principais');
  const actions = extractSection(markdownContent, isShort ? 'Explore Mais' : 'Plano de Ação');
  const mainIdea = isShort ? extractSection(markdownContent, 'Ideia Principal') : null;

  const typeEmoji = isShort ? '⚡' : '📺';
  const typeLabel = isShort ? 'Short' : 'Vídeo';

  let message = `🧠 *Watch Later Agent*\n\n`;
  message += `${typeEmoji} *${title}*\n`;
  message += `📺 Canal: ${channelName}\n`;
  if (duration) message += `⏱️ Duração: ${duration}\n`;
  message += `🏷️ Tipo: ${typeLabel}\n`;
  message += `\n`;

  if (isShort && mainIdea) {
    message += `*💡 Ideia Principal:*\n`;
    message += `${mainIdea}\n\n`;
  }

  if (insights) {
    message += isShort ? `*📌 Pontos-Chave:*\n` : `*🧠 Insights:*\n`;
    message += formatBullets(insights);
    message += `\n`;
  }

  if (actions) {
    message += isShort ? `*🔗 Explore Mais:*\n` : `*🎯 Ações:*\n`;
    message += formatBullets(actions);
    message += `\n`;
  }

  message += `🔗 ${url}`;

  return message;
}

/**
 * Formata um digest diário para WhatsApp.
 */
export function formatDailyDigest(videos: {
  title: string;
  channelName: string;
  url: string;
  isShort: boolean;
}[]): string {
  if (videos.length === 0) {
    return '🧠 *Watch Later Agent — Digest Diário*\n\n📭 Nenhum vídeo processado hoje.';
  }

  const shorts = videos.filter(v => v.isShort);
  const regular = videos.filter(v => !v.isShort);

  let message = `🧠 *Watch Later Agent — Digest Diário*\n`;
  message += `📊 *${videos.length}* vídeo(s) processado(s) hoje\n\n`;

  if (regular.length > 0) {
    message += `🎬 *Vídeos (${regular.length}):*\n`;
    for (const v of regular) {
      message += `• ${v.title} — _${v.channelName}_\n`;
    }
    message += `\n`;
  }

  if (shorts.length > 0) {
    message += `⚡ *Shorts (${shorts.length}):*\n`;
    for (const v of shorts) {
      message += `• ${v.title} — _${v.channelName}_\n`;
    }
  }

  return message;
}

/**
 * Extrai uma seção do markdown pelo título.
 */
function extractSection(markdown: string, sectionTitle: string): string | null {
  // Tentar encontrar a seção com ##
  const regex = new RegExp(`##\\s*(?:.*?)?${escapeRegex(sectionTitle)}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = markdown.match(regex);

  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}

/**
 * Formata bullets do markdown para texto WhatsApp limpo.
 */
function formatBullets(text: string): string {
  return text
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => {
      // Remover markdown bullets e formatação
      let clean = line
        .replace(/^[\s]*[-*]\s*(\[.\]\s*)?/, '') // remover - ou * e checkboxes
        .replace(/\*\*(.*?)\*\*/g, '*$1*')        // **bold** → *bold*
        .replace(/__(.*?)__/g, '_$1_')             // __italic__ → _italic_
        .trim();

      return `• ${clean}`;
    })
    .join('\n');
}

/**
 * Escapa caracteres especiais para uso em regex.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
