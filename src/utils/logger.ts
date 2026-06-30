import pino from 'pino';
import { getConfig } from '../config/env.js';

let _logger: pino.Logger | null = null;

/**
 * Inicializa o logger raiz. Deve ser chamado após loadConfig().
 */
export function initLogger(): pino.Logger {
  if (_logger) return _logger;

  let level: string;
  try {
    level = getConfig().LOG_LEVEL;
  } catch {
    level = 'info';
  }

  _logger = pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
      },
    },
  });

  return _logger;
}

/**
 * Retorna o logger raiz.
 */
export function getLogger(): pino.Logger {
  if (!_logger) {
    // Fallback: cria logger com defaults se ainda não foi inicializado
    return initLogger();
  }
  return _logger;
}

/**
 * Cria um child logger para um serviço específico.
 * Exemplo: createChildLogger('youtube') → logs terão { service: 'youtube' }
 */
export function createChildLogger(service: string): pino.Logger {
  return getLogger().child({ service });
}
