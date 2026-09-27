import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function newId(): string {
  return randomBytes(12).toString('base64url');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
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
