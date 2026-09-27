/**
 * Copia texto para a área de transferência. Na rede local o app roda em HTTP puro, onde
 * `navigator.clipboard` não existe (exige contexto seguro) — por isso o fallback clássico.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Permissão negada: tenta o método legado abaixo.
      if (!(err instanceof DOMException)) throw err;
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } finally {
    area.remove();
  }
}
