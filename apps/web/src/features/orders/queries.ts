import type {
  OrderCreateInput,
  OrderCreateResult,
  PoDetail,
  PoListItem,
  PoReceiveInput,
  PoStatus,
} from '@bot-op/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const keys = {
  all: ['purchase-orders'] as const,
  list: (status: PoStatus | null) => ['purchase-orders', 'list', status] as const,
  detail: (id: string) => ['purchase-orders', 'detail', id] as const,
};

export function usePurchaseOrders(status: PoStatus | null) {
  return useQuery({
    queryKey: keys.list(status),
    queryFn: () => api<PoListItem[]>(`/purchase-orders${status ? `?status=${status}` : ''}`),
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => api<PoDetail>(`/purchase-orders/${id}`),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OrderCreateInput) =>
      api<OrderCreateResult>('/orders', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

type ActionBody =
  | { action: 'approve'; body: { items?: { id: string; qtyOrdered: string }[] } }
  | { action: 'reject'; body: { reason: string } }
  | { action: 'mark-ordered'; body?: undefined }
  | { action: 'cancel'; body: { reason?: string } }
  | { action: 'receive'; body: PoReceiveInput };

export function usePoAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, body }: ActionBody) =>
      api<PoDetail>(`/purchase-orders/${id}/${action}`, { method: 'POST', body: body ?? {} }),
    onSuccess: (po) => {
      qc.setQueryData(keys.detail(id), po);
      // Receiving changes latest prices shown in the catalog.
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['purchase-orders', 'list'] }),
        qc.invalidateQueries({ queryKey: ['ingredients'] }),
      ]);
    },
  });
}

export const fetchSupplierMessage = (id: string) =>
  api<{ text: string }>(`/purchase-orders/${id}/supplier-message`).then((r) => r.text);

export const uploadAttachment = (
  file: Blob,
  filename = file instanceof File ? file.name : 'anh.jpg',
) => {
  const form = new FormData();
  form.append('file', file, filename);
  return api<{ id: string; mime: string }>('/attachments', { method: 'POST', body: form });
};
