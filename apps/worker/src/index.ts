import { createDb, QUEUES, startQueue, type PushJob } from '@bot-op/db';
import webpush from 'web-push';
import { loadConfig } from './config';
import { createPushHandler, type PushSend } from './jobs/push';

const log = {
  info: (...a: unknown[]) => console.log(new Date().toISOString(), ...a),
  warn: (...a: unknown[]) => console.warn(new Date().toISOString(), ...a),
};

const config = loadConfig();
const { db, close } = createDb(config.databaseUrl, { max: 5 });
const boss = await startQueue(config.databaseUrl, (err) => log.warn('pg-boss', err));

let send: PushSend;
if (config.vapid) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
  send = (target, payload) =>
    webpush.sendNotification(target, payload, { TTL: 3600, urgency: 'high' });
} else {
  log.warn('VAPID keys missing: push notifications are logged, not sent');
  send = async (target, payload) =>
    log.info('push (not sent)', target.endpoint.slice(0, 40), payload);
}

await boss.work<PushJob>(QUEUES.push, createPushHandler({ db, send, log }));
log.info('worker started');

const shutdown = async () => {
  await boss.stop({ graceful: true });
  await close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
