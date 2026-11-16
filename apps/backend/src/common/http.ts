import type { Request, Response } from 'express';

export function sendSuccess<T>(request: Request, response: Response, data: T): void {
  response.json({ success: true, data, requestId: request.requestId });
}

export function normalizeMediaType(contentType: string | undefined): string | undefined {
  if (!contentType) {
    return undefined;
  }
  const rawType = contentType.split(';')[0]?.trim().toLowerCase();
  return rawType || undefined;
}
