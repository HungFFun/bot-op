import { useRef, useState } from 'react';
import { Button, ErrorText, PageHeader } from '../../components/ui';
import { useImportIngredients } from '../../features/catalog/queries';
import { ApiRequestError } from '../../lib/api';

const TEMPLATE = [
  'Mã,Tên,Đơn vị,Hạng mục,NCC,NCC khác,Giá,SL tối thiểu,Ghi chú',
  'RAU-012,Xà lách lolo,kg,Rau,Rau Đà Lạt Xanh,"Chợ; Kamereo",35000,,',
  'THT-003,Ba chỉ heo,kg,Thịt,Thịt Sạch Bình An,,145000,2,Giao trước 9h',
].join('\n');

function downloadTemplate() {
  // BOM so Excel opens UTF-8 Vietnamese correctly.
  const blob = new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: 'mau-danh-muc-nguyen-lieu.csv',
  });
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPage() {
  const importFile = useImportIngredients();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const rowErrors =
    importFile.error instanceof ApiRequestError ? importFile.error.rowErrors : undefined;
  const r = importFile.data;

  return (
    <div>
      <PageHeader title="Nhập danh mục" back="/admin" />
      <div className="rounded-2xl bg-cream p-3 text-sm text-ink">
        <p>
          File <b>.xlsx</b> hoặc <b>.csv</b>, dòng đầu là tên cột. Bắt buộc: <b>Mã, Tên, Đơn vị</b>.
          Không bắt buộc: Hạng mục, NCC, NCC khác (nhiều NCC cách nhau bằng dấu ; hoặc ,), Giá, SL
          tối thiểu, Ghi chú.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>Mã đã có → cập nhật; mã mới → thêm.</li>
          <li>Hạng mục / NCC chưa có sẽ được tạo mới.</li>
          <li>Có Giá thì bắt buộc có NCC. Nhập lại cùng file không tạo giá trùng.</li>
          <li>Có dòng lỗi thì không nhập gì cả — sửa file rồi nhập lại.</li>
        </ul>
        <button
          className="mt-3 font-semibold text-ink underline decoration-elephant decoration-2 underline-offset-4"
          onClick={downloadTemplate}
        >
          Tải file mẫu
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          importFile.reset();
        }}
      />
      <div className="mt-3 grid gap-2">
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          {file ? `📄 ${file.name}` : 'Chọn file…'}
        </Button>
        <Button
          disabled={!file || importFile.isPending}
          onClick={() => file && importFile.mutate(file)}
        >
          {importFile.isPending ? 'Đang nhập…' : 'Nhập dữ liệu'}
        </Button>
      </div>

      <div className="mt-3 grid gap-2">
        <ErrorText error={importFile.error} />
        {rowErrors && (
          <ul className="max-h-80 overflow-y-auto rounded-xl border border-chili/40 text-sm">
            {rowErrors.map((e, i) => (
              <li key={i} className="border-b border-line px-3 py-2 last:border-0">
                <b>Dòng {e.row}:</b> {e.message}
              </li>
            ))}
          </ul>
        )}
        {r && (
          <div className="rounded-xl bg-bamboo-soft p-3 text-bamboo-dark">
            <p className="font-semibold">Đã nhập xong</p>
            <p className="mt-1 text-sm">
              Thêm {r.created} · Cập nhật {r.updated} nguyên liệu · {r.pricesAdded} giá mới ·{' '}
              {r.suppliersCreated} NCC mới · {r.categoriesCreated} hạng mục mới
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
