import type { Insight } from '@dama/engine';
import type {
  AchievementView,
  AnalysisResponse,
  CreateGameInput,
  GameSummaryView,
  MetaView,
  ProfileView,
  ReviewView,
  StudyAttemptResult,
  StudyView,
} from '@dama/protocol';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch (err) {
    // fetch só rejeita com TypeError em falha de rede.
    if (!(err instanceof TypeError)) throw err;
    throw new ApiError(0, 'network', 'Sem conexão com o servidor. Verifique se ele está rodando.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'http', data?.error?.message ?? `Erro ${res.status}`);
  }
  return data as T;
}

export interface MeResponse {
  readonly profile: ProfileView;
  readonly activeGames: readonly GameSummaryView[];
  readonly studiesDue: number;
}

export interface GameDetail {
  readonly summary: GameSummaryView;
  readonly startFen: string;
  readonly finalFen: string;
  readonly whiteName: string;
  readonly blackName: string;
  readonly moves: readonly {
    ply: number;
    key: string;
    notation: string;
    side: 'white' | 'black';
    path: number[];
    captures: number[];
    fenBefore: string;
  }[];
  readonly reviews: readonly ReviewView[];
}

export interface ProgressResponse {
  readonly profile: ProfileView;
  readonly achievements: readonly AchievementView[];
  readonly ratingHistory: readonly { rating: number; at: string }[];
}

export type AttemptResponse = StudyAttemptResult & { achievements: AchievementView[]; insight: Insight };

export const api = {
  me: () => request<MeResponse>('GET', '/api/me'),
  createProfile: (name: string) => request<{ profile: ProfileView }>('POST', '/api/profiles', { name }),
  rename: (name: string) => request<{ profile: ProfileView }>('PATCH', '/api/me', { name }),
  progress: () => request<ProgressResponse>('GET', '/api/me/progress'),
  meta: () => request<MetaView>('GET', '/api/meta'),
  createGame: (input: CreateGameInput) =>
    request<{ id: string; roomCode: string | null }>('POST', '/api/games', input),
  joinRoom: (code: string) => request<{ id: string }>('POST', `/api/rooms/${encodeURIComponent(code)}/join`),
  games: (before?: string) =>
    request<{ games: GameSummaryView[] }>(
      'GET',
      `/api/games${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  game: (id: string) => request<GameDetail>('GET', `/api/games/${encodeURIComponent(id)}`),
  studies: () => request<{ studies: StudyView[]; due: number }>('GET', '/api/studies'),
  dueStudies: () => request<{ studies: StudyView[] }>('GET', '/api/studies/due'),
  createStudy: (input: {
    variant: string;
    fen: string;
    title: string;
    notes?: string;
    gameId?: string;
    ply?: number;
  }) => request<{ study: StudyView }>('POST', '/api/studies', input),
  updateStudy: (id: string, input: { title?: string; notes?: string }) =>
    request<{ study: StudyView }>('PATCH', `/api/studies/${encodeURIComponent(id)}`, input),
  deleteStudy: (id: string) => request<void>('DELETE', `/api/studies/${encodeURIComponent(id)}`),
  attemptStudy: (id: string, key: string) =>
    request<AttemptResponse>('POST', `/api/studies/${encodeURIComponent(id)}/attempt`, { key }),
  analyze: (variant: string, fen: string, kind: 'analyze' | 'lookahead') =>
    request<AnalysisResponse>('POST', '/api/analysis', { variant, fen, kind }),
};
