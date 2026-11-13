import type { Request, Response } from 'express';
export function sendSuccess<T>(request: Request, response: Response, data: T): void {
  response.json({ success: true, data, requestId: request.requestId });
}
