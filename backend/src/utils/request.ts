import type { Request } from 'express';

export function extractIp(req: Pick<Request, 'ip' | 'headers'>): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim() || (req.ip ?? '');
  }
  return req.ip ?? '';
}
