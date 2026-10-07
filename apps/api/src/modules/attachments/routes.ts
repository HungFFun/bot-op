import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { attachments, purchaseOrders } from '@bot-op/db';
import { uuidSchema } from '@bot-op/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/errors';
import { canAccessBranch, currentUser } from '../../plugins/rbac';

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const idParams = z.object({ id: uuidSchema });

/**
 * Upload first, link later: the receive/expense form uploads photos, then submits their ids.
 * Unlinked files are visible only to the uploader.
 */
export const attachmentRoutes: FastifyPluginAsync<{ uploadDir: string }> = async (app, opts) => {
  app.post('/attachments', { preHandler: app.requireAuth }, async (req, reply) => {
    const user = currentUser(req);
    const file = await req.file();
    if (!file) throw new AppError(400, 'no_file', 'Vui lòng chọn ảnh');
    const ext = ALLOWED[file.mimetype];
    if (!ext)
      throw new AppError(400, 'unsupported_file', 'Chỉ nhận ảnh (JPG, PNG, WEBP, HEIC) hoặc PDF');

    const buffer = await file.toBuffer();
    const now = new Date();
    const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const filePath = `${dir}/${randomUUID()}.${ext}`;
    await mkdir(join(opts.uploadDir, dir), { recursive: true });
    await writeFile(join(opts.uploadDir, filePath), buffer);

    const [row] = await app.db
      .insert(attachments)
      .values({ filePath, mime: file.mimetype, sizeBytes: buffer.length, uploadedBy: user.id })
      .returning({ id: attachments.id, mime: attachments.mime });
    return reply.status(201).send(row);
  });

  app.get('/attachments/:id', { preHandler: app.requireAuth }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const user = currentUser(req);
    const att = await app.db.query.attachments.findFirst({ where: eq(attachments.id, id) });
    if (!att) throw notFound('Tệp');

    // Ingredient photos are catalog data: everyone signed in may see them.
    let allowed = att.uploadedBy === user.id || att.ownerType === 'ingredient';
    if (!allowed && att.ownerType === 'po' && att.ownerId) {
      const po = await app.db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.id, att.ownerId),
      });
      allowed = !!po && canAccessBranch(user, po.branchId);
    }
    if (!allowed) throw notFound('Tệp');

    return (
      reply
        .header('content-type', att.mime)
        // Ids never change content, so the browser may keep the file.
        .header('cache-control', 'private, max-age=31536000, immutable')
        .send(createReadStream(join(opts.uploadDir, att.filePath)))
    );
  });
};
