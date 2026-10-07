import {
  formatDateTime,
  formatVnd,
  ingredientInputSchema,
  type IngredientListItem,
} from '@bot-op/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Button,
  Empty,
  ErrorText,
  Field,
  Input,
  PageHeader,
  Select,
  Chip,
} from '../../components/ui';
import { IngredientPhotoField } from '../../features/catalog/IngredientPhotoField';
import {
  useAddPrice,
  useCategories,
  useIngredient,
  usePriceHistory,
  useSaveIngredient,
  useSuppliers,
} from '../../features/catalog/queries';

const SOURCE_LABELS = { po_receipt: 'Nhận hàng', manual: 'Nhập tay', import: 'Import' } as const;

export function IngredientEditPage() {
  const { id } = useParams();
  const ingredient = useIngredient(id);
  if (id && ingredient.isPending) return <Empty>Đang tải…</Empty>;
  if (id && ingredient.isError) return <ErrorText error={ingredient.error} />;
  // key resets the form state when switching between ingredients
  return <IngredientForm key={id ?? 'new'} initial={ingredient.data} />;
}

function IngredientForm({ initial }: { initial: IngredientListItem | undefined }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const suppliers = useSuppliers();
  const save = useSaveIngredient();
  // New ingredient: the photo is sent with "Lưu". Existing one: saved right away so it cannot be forgotten.
  const [image, setImage] = useState<{ id: string | null | undefined; url: string | null }>({
    id: undefined,
    url: initial?.imageUrl ?? null,
  });
  const photoSave = useSaveIngredient();
  const onPhoto = (imageId: string | null, url: string | null) => {
    setImage({ id: imageId, url });
    if (initial)
      photoSave.mutate({
        id: initial.id,
        code: initial.code,
        name: initial.name,
        unit: initial.unit,
        imageId,
      });
  };
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    unit: initial?.unit ?? '',
    categoryId: initial?.category?.id ?? '',
    defaultSupplierId: initial?.defaultSupplier?.id ?? '',
    minOrderQty: initial?.minOrderQty ?? '',
    note: initial?.note ?? '',
    active: initial?.active ?? true,
  });
  const [alternates, setAlternates] = useState<string[]>(
    () => initial?.alternateSuppliers.map((s) => s.id) ?? [],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const toggleAlternate = (id: string) =>
    setAlternates((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = ingredientInputSchema.safeParse({
      ...form,
      categoryId: form.categoryId || null,
      defaultSupplierId: form.defaultSupplierId || null,
      minOrderQty: form.minOrderQty || null,
      alternateSupplierIds: alternates.filter((id) => id !== form.defaultSupplierId),
      ...(!initial && image.id !== undefined && { imageId: image.id }),
    });
    if (!parsed.success)
      return setFormError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
    setFormError(null);
    save.mutate(
      { ...parsed.data, id: initial?.id },
      {
        onSuccess: (saved) =>
          initial ? undefined : navigate(`/admin/ingredients/${saved.id}`, { replace: true }),
      },
    );
  };

  return (
    <div>
      <PageHeader title={initial ? initial.name : 'Thêm nguyên liệu'} back="/admin/ingredients" />
      <form onSubmit={onSubmit} className="grid gap-3">
        <IngredientPhotoField
          name={form.name}
          imageUrl={image.url}
          busy={photoSave.isPending}
          onChange={onPhoto}
        />
        <ErrorText error={photoSave.error} />
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Field label="Mã">
            <Input
              value={form.code}
              onChange={set('code')}
              placeholder="RAU-012"
              autoCapitalize="characters"
            />
          </Field>
          <Field label="Đơn vị">
            <Input value={form.unit} onChange={set('unit')} placeholder="kg" list="units" />
          </Field>
        </div>
        <datalist id="units">
          {['kg', 'g', 'l', 'ml', 'chai', 'thùng', 'bó', 'cái', 'gói', 'hộp', 'bao'].map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <Field label="Tên">
          <Input value={form.name} onChange={set('name')} placeholder="Xà lách lolo" />
        </Field>
        <Field label="Hạng mục">
          <Select value={form.categoryId} onChange={set('categoryId')}>
            <option value="">— Không —</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nhà cung cấp mặc định">
          <Select value={form.defaultSupplierId} onChange={set('defaultSupplierId')}>
            <option value="">— Không —</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <span className="text-sm font-medium text-ink">NCC khác</span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            Nơi khác cũng mua được món này. Khi order sẽ được gợi ý đầu tiên lúc đổi NCC.
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {suppliers.data
              ?.filter((s) => s.id !== form.defaultSupplierId)
              .map((s) => (
                <Chip
                  key={s.id}
                  active={alternates.includes(s.id)}
                  onClick={() => toggleAlternate(s.id)}
                >
                  {alternates.includes(s.id) ? '✓ ' : ''}
                  {s.name}
                </Chip>
              ))}
          </div>
        </div>
        <Field label="Số lượng order tối thiểu">
          <Input
            value={form.minOrderQty}
            onChange={set('minOrderQty')}
            inputMode="decimal"
            placeholder="Không bắt buộc"
          />
        </Field>
        <Field label="Ghi chú">
          <Input value={form.note} onChange={set('note')} />
        </Field>
        {initial && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => {
                const active = e.target.checked;
                setForm((f) => ({ ...f, active }));
              }}
            />
            Đang dùng
          </label>
        )}
        <ErrorText error={formError ? { message: formError } : save.error} />
        {save.isSuccess && initial && <p className="text-sm text-bamboo-dark">Đã lưu.</p>}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </form>

      {initial && <PriceSection ingredient={initial} />}
    </div>
  );
}

function PriceSection({ ingredient }: { ingredient: IngredientListItem }) {
  const history = usePriceHistory(ingredient.id);
  const suppliers = useSuppliers();
  const addPrice = useAddPrice(ingredient.id);
  const [supplierId, setSupplierId] = useState(ingredient.defaultSupplier?.id ?? '');
  const [price, setPrice] = useState('');
  const amount = price ? Number(price) : null;

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId || !amount) return;
    addPrice.mutate({ supplierId, unitPrice: amount }, { onSuccess: () => setPrice('') });
  };

  return (
    <section className="mt-6">
      <h2 className="text-lg font-bold">Lịch sử giá</h2>
      <form onSubmit={onAdd} className="mt-3 grid gap-2 rounded-2xl bg-cream p-3">
        <Select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="!mt-0"
        >
          <option value="">Chọn nhà cung cấp…</option>
          {suppliers.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            placeholder={`Đơn giá / ${ingredient.unit}`}
            value={amount ? amount.toLocaleString('vi-VN') : ''}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 12))}
            className="!mt-0"
          />
          <Button
            type="submit"
            disabled={!supplierId || !amount || addPrice.isPending}
            className="shrink-0"
          >
            Thêm giá
          </Button>
        </div>
        <ErrorText error={addPrice.error} />
      </form>

      {history.data?.length === 0 && <Empty>Chưa có giá nào.</Empty>}
      <ul className="mt-2 divide-y divide-line">
        {history.data?.map((h) => (
          <li key={h.id} className="flex items-center justify-between py-2 text-sm">
            <div>
              <div className="font-semibold">
                {formatVnd(h.unitPrice)}/{ingredient.unit}
              </div>
              <div className="text-ink-muted">
                {h.supplierName} · {SOURCE_LABELS[h.source]}
                {h.recordedBy ? ` · ${h.recordedBy.name}` : ''}
              </div>
            </div>
            <div className="text-right text-ink-muted">{formatDateTime(h.recordedAt)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
