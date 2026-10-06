import { useMe } from '../features/auth/queries';

const TILES = [
  { icon: '🛒', title: 'Order nguyên liệu', desc: 'Chọn nguyên liệu, gửi order theo NCC' },
  { icon: '💸', title: 'Tạo khoản chi', desc: 'Sinh mã chi, chụp hoá đơn' },
  { icon: '📋', title: 'Vận hành', desc: 'Sự cố, thông báo, báo cáo từ group Zalo' },
];

export function HomePage() {
  const { data: me } = useMe();
  return (
    <div>
      <h1 className="text-xl font-bold">Xin chào, {me?.name}</h1>
      <div className="mt-4 grid gap-3">
        {TILES.map((t) => (
          <div
            key={t.title}
            className="flex items-center gap-4 rounded-2xl border border-stone-200 p-4"
          >
            <span className="text-3xl">{t.icon}</span>
            <div>
              <div className="font-semibold">{t.title}</div>
              <div className="text-sm text-stone-500">{t.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
