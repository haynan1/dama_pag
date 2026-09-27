import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFullscreen } from '../src/lib/fullscreen.ts';

let current: Element | null = null;

beforeEach(() => {
  current = null;
  localStorage.clear();
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
  document.documentElement.requestFullscreen = vi.fn(async () => {
    current = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  document.exitFullscreen = vi.fn(async () => {
    current = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
});

afterEach(cleanup);

describe('Tela cheia', () => {
  it('alterna e lembra a escolha', async () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(true);
    expect(result.current.active).toBe(false);

    await act(async () => result.current.toggle());
    expect(result.current.active).toBe(true);
    expect(localStorage.getItem('dama:fullscreen')).toBe('1');

    await act(async () => result.current.toggle());
    expect(result.current.active).toBe(false);
    expect(localStorage.getItem('dama:fullscreen')).toBe('0');
  });

  it('sair pelo navegador (Esc) também registra a escolha', async () => {
    const { result } = renderHook(() => useFullscreen());
    await act(async () => result.current.toggle());
    await act(async () => {
      current = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.active).toBe(false);
    expect(localStorage.getItem('dama:fullscreen')).toBe('0');
  });

  it('restaura no primeiro toque depois de recarregar', async () => {
    localStorage.setItem('dama:fullscreen', '1');
    renderHook(() => useFullscreen({ restore: true }));
    await act(async () => document.body.click());
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('toque num link (voltar) não liga a tela cheia', async () => {
    localStorage.setItem('dama:fullscreen', '1');
    renderHook(() => useFullscreen({ restore: true }));
    const link = document.createElement('a');
    link.href = '#voltar';
    document.body.append(link);
    await act(async () => link.click());
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
    link.remove();
  });

  it('sair da partida sai da tela cheia sem mudar a preferência', async () => {
    const { result, unmount } = renderHook(() => useFullscreen({ restore: true }));
    await act(async () => result.current.toggle());
    expect(localStorage.getItem('dama:fullscreen')).toBe('1');
    await act(async () => unmount());
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(current).toBeNull();
    expect(localStorage.getItem('dama:fullscreen')).toBe('1');
  });

  it('não restaura quando a pessoa saiu da tela cheia', async () => {
    localStorage.setItem('dama:fullscreen', '0');
    renderHook(() => useFullscreen({ restore: true }));
    await act(async () => document.body.click());
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });
});
