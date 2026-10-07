import { CATALOG_EDITOR_ROLES, PO_APPROVER_ROLES } from '@bot-op/shared';
import { Link } from 'react-router';
import { useMe } from '../features/auth/queries';
import { PushCard } from '../features/push/PushCard';

type Tile = { icon: string; title: string; desc: string; to?: string };

const TILES: Tile[] = [
  {
    icon: '🛒',
    title: 'Order nguyên liệu',
    desc: 'Chọn nguyên liệu, gửi order theo NCC',
    to: '/order',
  },
  { icon: '📦', title: 'Đơn hàng', desc: 'Duyệt, đặt NCC, nhận hàng', to: '/po' },
  { icon: '💸', title: 'Tạo khoản chi', desc: 'Sinh mã chi, chụp hoá đơn' },
  { icon: '📋', title: 'Vận hành', desc: 'Sự cố, thông báo, báo cáo từ group Zalo' },
];

const ADMIN_TILE: Tile = {
  icon: '🗂️',
  title: 'Quản trị',
  desc: 'Danh mục nguyên liệu, nhà cung cấp, tài khoản',
  to: '/admin',
};

export function HomePage() {
  const { data: me } = useMe();
  const canEditCatalog = !!me && (CATALOG_EDITOR_ROLES as readonly string[]).includes(me.role);
  const tiles = canEditCatalog ? [...TILES, ADMIN_TILE] : TILES;
  const isApprover = !!me && (PO_APPROVER_ROLES as readonly string[]).includes(me.role);

  return (
    <div>
      <h1 className="text-lg font-bold">Xin chào, {me?.name}</h1>
      <div className="mt-3 grid gap-2">
        {isApprover && <PushCard />}
        {tiles.map((t) => {
          const body = (
            <>
              <span className="text-2xl">{t.icon}</span>
              <div>
                <div className="font-semibold">{t.title}</div>
                <div className="text-sm text-ink-muted">{t.desc}</div>
              </div>
            </>
          );
          const className = 'flex items-center gap-3 rounded-2xl border border-line p-3';
          return t.to ? (
            <Link key={t.title} to={t.to} className={`${className} active:bg-cream`}>
              {body}
            </Link>
          ) : (
            <div key={t.title} className={`${className} opacity-60`}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
