import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../common/api-error.js';

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', '找不到此 API 路徑。'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (response.headersSent) {
    _next(error);
    return;
  }
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = '伺服器發生錯誤，請稍後再試。';
  if (error instanceof ApiError) {
    ({ status, code, message } = error);
  } else if (error instanceof Error && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'JSON 格式錯誤。';
    } else if (error.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = '請求內容超過大小限制。';
    } else if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
      status = 415;
      code = 'UNSUPPORTED_MEDIA_TYPE';
      message = '不支援此內容編碼。';
    }
  }
  if (status >= 500)
    console.error(JSON.stringify({ level: 'error', requestId: request.requestId, code }));
  response
    .status(status)
    .json({ success: false, error: { code, message }, requestId: request.requestId });
};
