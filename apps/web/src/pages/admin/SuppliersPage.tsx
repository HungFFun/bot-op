import { supplierInputSchema, type Supplier } from '@bot-op/shared';
import { useState, type FormEvent } from 'react';
import { Button, Empty, ErrorText, Field, Input, PageHeader } from '../../components/ui';
import { useSaveSupplier, useSuppliers } from '../../features/catalog/queries';

export function SuppliersPage() {
  const suppliers = useSuppliers(true);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  if (editing) {
    return (
      <SupplierForm
        key={editing === 'new' ? 'new' : editing.id}
        initial={editing === 'new' ? undefined : editing}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Nhà cung cấp"
        back="/admin"
        action={
          <Button onClick={() => setEditing('new')} className="!py-2">
            + Thêm
          </Button>
        }
      />
      <ErrorText error={suppliers.error} />
      {suppliers.data?.length === 0 && <Empty>Chưa có nhà cung cấp nào.</Empty>}
      <ul className="divide-y divide-line">
        {suppliers.data?.map((s) => (
          <li key={s.id}>
            <button
              className="block w-full py-2.5 text-left active:bg-cream"
              onClick={() => setEditing(s)}
            >
              <div className={`font-semibold ${s.active ? '' : 'text-ink-muted line-through'}`}>
                {s.name}
              </div>
              <div className="text-sm text-ink-muted">
                {[s.phone, s.zaloContact && `Zalo: ${s.zaloContact}`, s.paymentTerms]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SupplierForm({ initial, onDone }: { initial?: Supplier; onDone: () => void }) {
  const save = useSaveSupplier();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    zaloContact: initial?.zaloContact ?? '',
    address: initial?.address ?? '',
    paymentTerms: initial?.paymentTerms ?? '',
    note: initial?.note ?? '',
    active: initial?.active ?? true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = supplierInputSchema.safeParse(form);
    if (!parsed.success)
      return setFormError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
    setFormError(null);
    save.mutate({ ...parsed.data, id: initial?.id }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <PageHeader title={initial ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'} />
      <Field label="Tên">
        <Input value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Số điện thoại">
        <Input value={form.phone} onChange={set('phone')} type="tel" />
      </Field>
      <Field label="Zalo">
        <Input value={form.zaloContact} onChange={set('zaloContact')} />
      </Field>
      <Field label="Địa chỉ">
        <Input value={form.address} onChange={set('address')} />
      </Field>
      <Field label="Điều khoản thanh toán">
        <Input
          value={form.paymentTerms}
          onChange={set('paymentTerms')}
          placeholder="vd: công nợ 7 ngày"
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
          Đang hợp tác
        </label>
      )}
      <ErrorText error={formError ? { message: formError } : save.error} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
    </form>
  );
}
