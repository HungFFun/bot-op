import { Link } from 'react-router';
import { PageHeader } from '../../components/ui';
import { useMe } from '../../features/auth/queries';

export function AdminHomePage() {
  const { data: me } = useMe();
  const links = [
    {
      to: '/admin/ingredients',
      icon: '🥬',
      title: 'Nguyên liệu',
      desc: 'Mã, đơn vị, NCC mặc định, giá nhập',
    },
    {
      to: '/admin/suppliers',
      icon: '🚚',
      title: 'Nhà cung cấp',
      desc: 'Liên hệ, điều khoản thanh toán',
    },
    {
      to: '/admin/categories',
      icon: '🗂️',
      title: 'Hạng mục',
      desc: 'Nhóm nguyên liệu (Rau, Thịt, Khô…)',
    },
    ...(me?.role === 'owner'
      ? [
          {
            to: '/admin/users',
            icon: '👤',
            title: 'Tài khoản',
            desc: 'Cấp tài khoản, đặt lại mật khẩu, khoá tài khoản',
          },
          {
            to: '/admin/import',
            icon: '📥',
            title: 'Nhập từ Excel/CSV',
            desc: 'Nhập hàng loạt nguyên liệu và giá',
          },
        ]
      : []),
  ];
  return (
    <div>
      <PageHeader title="Quản trị" />
      <div className="grid gap-2">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="flex items-center gap-3 rounded-2xl border border-line p-3 active:bg-cream"
          >
            <span className="text-2xl">{l.icon}</span>
            <div>
              <div className="font-semibold">{l.title}</div>
              <div className="text-sm text-ink-muted">{l.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
