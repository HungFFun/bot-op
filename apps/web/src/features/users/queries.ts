import type { BranchRef, UserCreateInput, UserListItem, UserUpdateInput } from '@bot-op/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const usersKey = ['users'] as const;

export function useUsers() {
  return useQuery({ queryKey: usersKey, queryFn: () => api<UserListItem[]>('/users') });
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => api<BranchRef[]>('/branches'),
    staleTime: 10 * 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserCreateInput) => api<UserListItem>('/users', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UserUpdateInput & { id: string }) =>
      api<UserListItem>(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api<void>(`/users/${id}/password`, { method: 'POST', body: { password } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
  });
}
