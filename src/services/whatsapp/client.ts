import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'node:path';
import fs from 'node:fs';
import { createChildLogger } from '../../utils/logger.js';
import { getConfig } from '../../config/env.js';
import { handleIncomingMessage } from './message-handler.js';

const log = createChildLogger('whatsapp');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUTH_DIR = path.join(DATA_DIR, 'whatsapp-auth');

let sock: WASocket | null = null;
let isConnected = false;
let qrCallback: ((qr: string) => void) | null = null;

/**
 * Retorna o status da conexão WhatsApp.
 */
export function getWhatsAppStatus(): { connected: boolean } {
  return { connected: isConnected };
}

/**
 * Define um callback para receber o QR code (usado pelo comando Discord).
 */
export function onQRCode(callback: (qr: string) => void): void {
  qrCallback = callback;
}

/**
 * Inicializa a conexão com o WhatsApp via Baileys.
 * Na primeira vez, gera um QR code para autenticação.
 * Nas próximas vezes, reconecta automaticamente usando credenciais salvas.
 */
export async function initWhatsApp(): Promise<WASocket | null> {
  try {
    const config = getConfig();

    if (!config.WHATSAPP_ENABLED) {
      log.info('WhatsApp desabilitado (WHATSAPP_ENABLED=false)');
      return null;
    }

    // Garantir diretório de auth
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true, // Mostra QR no terminal como fallback
      logger: undefined as any, // Silenciar logs internos do Baileys
    });

    // Salvar credenciais quando atualizadas
    sock.ev.on('creds.update', saveCreds);

    // Gerenciar estado da conexão
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && qrCallback) {
        qrCallback(qr);
      }

      if (connection === 'close') {
        isConnected = false;
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

        if (reason === DisconnectReason.loggedOut) {
          log.warn('WhatsApp deslogado. Execute /whatsapp-setup novamente.');
          // Limpar credenciais
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
        } else {
          log.info('WhatsApp desconectado, tentando reconectar...');
          // Reconectar após 5 segundos
          setTimeout(() => {
            initWhatsApp().catch((err) => {
              log.error({ err: err.message }, 'Falha ao reconectar WhatsApp');
            });
          }, 5000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        log.info('📱 WhatsApp conectado com sucesso!');
      }
    });

    // Escutar mensagens recebidas
    sock.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify' && m.messages.length > 0) {
        for (const msg of m.messages) {
          await handleIncomingMessage(msg, sock!);
        }
      }
    });

    return sock;
  } catch (error: any) {
    log.error({ err: error.message }, 'Erro ao inicializar WhatsApp');
    return null;
  }
}

/**
 * Retorna a instância do socket WhatsApp (singleton).
 */
export function getWhatsAppSocket(): WASocket | null {
  return sock;
}

/**
 * Busca o JID (identificador) de um grupo pelo nome.
 */
export async function findGroupByName(groupName: string): Promise<string | null> {
  if (!sock || !isConnected) {
    log.warn('WhatsApp não conectado. Não é possível buscar grupo.');
    return null;
  }

  try {
    const groups = await sock.groupFetchAllParticipating();

    for (const [jid, metadata] of Object.entries(groups)) {
      if (metadata.subject.toLowerCase().includes(groupName.toLowerCase())) {
        log.info({ groupName: metadata.subject, jid }, 'Grupo encontrado');
        return jid;
      }
    }

    log.warn({ groupName }, 'Grupo não encontrado');
    return null;
  } catch (error: any) {
    log.error({ err: error.message }, 'Erro ao buscar grupo');
    return null;
  }
}

/**
 * Envia uma mensagem de texto para um JID (grupo ou contato).
 */
export async function sendMessage(jid: string, text: string): Promise<boolean> {
  if (!sock || !isConnected) {
    log.warn('WhatsApp não conectado. Mensagem não enviada.');
    return false;
  }

  try {
    await sock.sendMessage(jid, { text });
    log.info({ jid, textLength: text.length }, 'Mensagem enviada via WhatsApp');
    return true;
  } catch (error: any) {
    log.error({ err: error.message, jid }, 'Erro ao enviar mensagem WhatsApp');
    return false;
  }
}

/**
 * Desconecta o WhatsApp.
 */
export async function disconnectWhatsApp(): Promise<void> {
  if (sock) {
    sock.end(undefined);
    sock = null;
    isConnected = false;
    log.info('WhatsApp desconectado');
  }
}
