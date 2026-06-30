import { randomInt } from 'node:crypto';

/**
 * Delay com duração humanizada (entre min e max ms).
 * Útil para simular comportamento humano no Puppeteer.
 */
export function humanDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
  const delay = randomInt(minMs, maxMs + 1);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Formata duração em segundos para string legível (ex: "12:34" ou "1:02:15").
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Extrai o video ID de uma URL do YouTube.
 * Suporta: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  // Se a string já é um ID de 11 caracteres
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }

  return null;
}

/**
 * Trunca texto mantendo palavras inteiras.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

/**
 * Sanitiza um nome de arquivo removendo caracteres inválidos.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 200);
}

/**
 * Retorna timestamp ISO formatado para log.
 */
export function timestamp(): string {
  return new Date().toISOString();
}
