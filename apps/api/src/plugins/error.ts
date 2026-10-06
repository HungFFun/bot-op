import type { ApiError } from '@bot-op/shared';
import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export default fp(async (app) => {
  app.setErrorHandler<FastifyError | Error>((err, req, reply) => {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      const body: ApiError = {
        error: 'validation',
        message: issues[0]?.message ?? 'Dữ liệu không hợp lệ',
        issues,
      };
      return reply.status(400).send(body);
    }
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    const status = 'statusCode' in err && err.statusCode ? err.statusCode : 500;
    if (status < 500) {
      return reply.status(status).send({ error: 'bad_request', message: 'Yêu cầu không hợp lệ' });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Lỗi hệ thống, vui lòng thử lại' });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: 'not_found', message: 'Không tìm thấy' }),
  );
});
