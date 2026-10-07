import { z } from 'zod';

/** Body of PushSubscription.toJSON() from the browser. */
export const pushSubscribeSchema = z.object({
  endpoint: z.url({ error: 'Đăng ký thông báo không hợp lệ' }).max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().max(1000) });

/** What the service worker receives in a push event. */
export type PushPayload = { title: string; body: string; url: string; tag?: string };
