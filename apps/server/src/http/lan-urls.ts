import { networkInterfaces } from 'node:os';

/** Endereços IPv4 privados desta máquina: é por eles que os outros dispositivos entram. */
export function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(addr.address))
        urls.push(`http://${addr.address}:${port}`);
    }
  }
  return urls;
}
