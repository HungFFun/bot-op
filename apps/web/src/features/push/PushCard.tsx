import { Button, ErrorText } from '../../components/ui';
import { usePush, type PushState } from './usePush';

const HINT: Partial<Record<PushState, string>> = {
  'ios-install':
    'Trên iPhone: bấm nút Chia sẻ (ô vuông có mũi tên) → "Thêm vào MH chính", rồi mở app từ màn hình chính để bật thông báo.',
  unsupported:
    'Trình duyệt này chưa nhận được thông báo. Dùng Chrome (Android) hoặc app trên màn hình chính (iPhone).',
  'not-configured': 'Máy chủ chưa cấu hình thông báo (thiếu VAPID key).',
  denied: 'Thông báo đang bị chặn. Mở cài đặt trang web trong trình duyệt và cho phép Thông báo.',
};

/** Lets approvers turn on "new order" notifications on this device. */
export function PushCard() {
  const { state, busy, error, enable, disable } = usePush();
  if (state === 'loading') return null;
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{state === 'on' ? '🔔' : '🔕'}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Thông báo đơn mới</div>
          <div className="text-sm text-ink-muted">
            {state === 'on' ? 'Đang bật trên máy này' : 'Báo ngay khi có đơn chờ duyệt'}
          </div>
        </div>
        {state === 'off' && (
          <Button onClick={enable} disabled={busy} className="!py-2">
            Bật
          </Button>
        )}
        {state === 'on' && (
          <Button variant="secondary" onClick={disable} disabled={busy} className="!py-2">
            Tắt
          </Button>
        )}
      </div>
      {HINT[state] && <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-sm">{HINT[state]}</p>}
      {error && (
        <div className="mt-2">
          <ErrorText error={{ message: error }} />
        </div>
      )}
    </div>
  );
}
