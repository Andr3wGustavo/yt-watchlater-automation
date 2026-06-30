import path from 'node:path';
import fs from 'node:fs';
import { sanitizeFilename } from '../../utils/helpers.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('markdown-builder');

const OUTPUT_DIR = path.resolve(process.cwd(), 'data', 'output');

/**
 * Salva o conteúdo Markdown gerado pelo LLM em um arquivo .md local.
 * Retorna o caminho absoluto do arquivo salvo.
 */
export function saveMarkdown(
  youtubeId: string,
  title: string,
  markdownContent: string,
): string {
  // Garantir que o diretório existe
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Gerar nome do arquivo: YYYY-MM-DD_titulo-sanitizado_youtubeId.md
  const datePrefix = new Date().toISOString().slice(0, 10);
  const sanitizedTitle = sanitizeFilename(title);
  const filename = `${datePrefix}_${sanitizedTitle}_${youtubeId}.md`;
  const filePath = path.join(OUTPUT_DIR, filename);

  fs.writeFileSync(filePath, markdownContent, 'utf-8');

  log.info({ filePath, size: markdownContent.length }, 'Markdown salvo');
  return filePath;
}

/**
 * Lê um arquivo .md do diretório de output.
 */
export function readMarkdown(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Gera o Buffer do arquivo .md para envio como attachment no Discord.
 */
export function getMarkdownBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

/**
 * Retorna o nome do arquivo a partir do caminho completo.
 */
export function getMarkdownFilename(filePath: string): string {
  return path.basename(filePath);
}
