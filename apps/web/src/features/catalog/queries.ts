import type {
  Category,
  CategoryInput,
  ImportResult,
  IngredientInput,
  IngredientListItem,
  ManualPriceInput,
  PriceHistoryItem,
  Supplier,
  SupplierInput,
} from '@bot-op/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const keys = {
  ingredients: ['ingredients'] as const,
  ingredientList: (f: IngredientFilter) => ['ingredients', 'list', f] as const,
  ingredient: (id: string) => ['ingredients', 'detail', id] as const,
  prices: (id: string) => ['ingredients', 'prices', id] as const,
  suppliers: (includeInactive: boolean) => ['suppliers', includeInactive] as const,
  categories: ['categories'] as const,
};

export type IngredientFilter = { q: string; category: string | null; includeInactive: boolean };

export function useIngredients(f: IngredientFilter) {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.category) params.set('category', f.category);
  if (f.includeInactive) params.set('includeInactive', 'true');
  return useQuery({
    queryKey: keys.ingredientList(f),
    queryFn: () => api<IngredientListItem[]>(`/ingredients?${params}`),
    placeholderData: keepPreviousData,
  });
}

export function useIngredient(id: string | undefined) {
  return useQuery({
    queryKey: keys.ingredient(id ?? ''),
    queryFn: () => api<IngredientListItem>(`/ingredients/${id}`),
    enabled: !!id,
  });
}

export function usePriceHistory(id: string | undefined) {
  return useQuery({
    queryKey: keys.prices(id ?? ''),
    queryFn: () => api<PriceHistoryItem[]>(`/ingredients/${id}/prices`),
    enabled: !!id,
  });
}

export function useSuppliers(includeInactive = false) {
  return useQuery({
    queryKey: keys.suppliers(includeInactive),
    queryFn: () => api<Supplier[]>(`/suppliers${includeInactive ? '?includeInactive=true' : ''}`),
  });
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: () => api<Category[]>('/categories') });
}

/** Any catalog write can change what the ingredient list shows, so refresh all catalog queries. */
function useInvalidateCatalog() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.ingredients }),
      qc.invalidateQueries({ queryKey: ['suppliers'] }),
      qc.invalidateQueries({ queryKey: keys.categories }),
    ]);
}

export function useSaveIngredient() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, ...body }: IngredientInput & { id?: string }) =>
      api<IngredientListItem>(id ? `/ingredients/${id}` : '/ingredients', {
        method: id ? 'PATCH' : 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useAddPrice(ingredientId: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (body: ManualPriceInput) =>
      api<IngredientListItem>(`/ingredients/${ingredientId}/prices`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useSaveSupplier() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<SupplierInput> & { id?: string }) =>
      api<Supplier>(id ? `/suppliers/${id}` : '/suppliers', {
        method: id ? 'PATCH' : 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useSaveCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<CategoryInput> & { id?: string }) =>
      api<Category>(id ? `/categories/${id}` : '/categories', {
        method: id ? 'PATCH' : 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useImportIngredients() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<ImportResult>('/ingredients/import', { method: 'POST', body: form });
    },
    onSuccess: invalidate,
  });
}
