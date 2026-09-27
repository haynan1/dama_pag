import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from './api.ts';

export const keys = {
  me: ['me'] as const,
  meta: ['meta'] as const,
  progress: ['progress'] as const,
  games: ['games'] as const,
  game: (id: string) => ['game', id] as const,
  studies: ['studies'] as const,
  due: ['studies', 'due'] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: api.me,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    staleTime: 10_000,
  });
}

export function useMeta() {
  return useQuery({ queryKey: keys.meta, queryFn: api.meta, staleTime: 5 * 60_000 });
}
