import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Identificadores e tokens. Só Web Crypto (`crypto.getRandomValues`, presente no Node e no
 * navegador) e SHA-256 síncrono em JS puro: o mesmo módulo roda no servidor e no servidor
 * embutido no app Android.
 */

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Inteiro uniforme em [0, max), sem viés de módulo (rejeição). */
function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % max;
  }
}

export function newId(): string {
  return base64url(randomBytes(12));
}

export function newToken(): string {
  return base64url(randomBytes(32));
}

export function hashToken(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(token)));
}

/** Comparação em tempo constante para strings de mesmo tamanho. */
export function safeEqual(a: string, b: string): boolean {
  const x = utf8ToBytes(a);
  const y = utf8ToBytes(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/** Sem caracteres ambíguos (0/O, 1/I): fácil de ditar em voz alta na sala. */
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  return code;
}

export function nowIso(): string {
  return new Date().toISOString();
}
