import { useState, type FormEvent } from 'react';
import { Button, Empty, ErrorText, Input, PageHeader } from '../../components/ui';
import { useCategories, useDeleteCategory, useSaveCategory } from '../../features/catalog/queries';

export function CategoriesPage() {
  const categories = useCategories();
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState('');

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const sortOrder = (categories.data?.length ?? 0) * 10;
    save.mutate({ name, sortOrder }, { onSuccess: () => setName('') });
  };

  const rename = (id: string, current: string) => {
    const next = window.prompt('Tên mới', current)?.trim();
    if (next && next !== current) save.mutate({ id, name: next });
  };

  const del = (id: string, n: string) => {
    if (
      window.confirm(
        `Xoá hạng mục "${n}"? Nguyên liệu trong hạng mục sẽ chuyển thành "không hạng mục".`,
      )
    ) {
      remove.mutate(id);
    }
  };

  return (
    <div>
      <PageHeader title="Hạng mục" back="/admin" />
      <form onSubmit={onAdd} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên hạng mục mới"
          className="!mt-0"
        />
        <Button type="submit" disabled={!name.trim() || save.isPending} className="shrink-0">
          Thêm
        </Button>
      </form>
      <div className="mt-2">
        <ErrorText error={save.error ?? remove.error ?? categories.error} />
      </div>
      {categories.data?.length === 0 && <Empty>Chưa có hạng mục nào.</Empty>}
      <ul className="mt-2 divide-y divide-line">
        {categories.data?.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            <span className="flex-1 font-medium">{c.name}</span>
            <Button
              variant="secondary"
              className="!px-3 !py-2 text-sm"
              onClick={() => rename(c.id, c.name)}
            >
              Đổi tên
            </Button>
            <Button
              variant="danger"
              className="!px-3 !py-2 text-sm"
              onClick={() => del(c.id, c.name)}
            >
              Xoá
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
