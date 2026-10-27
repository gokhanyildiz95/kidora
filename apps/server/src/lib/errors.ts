export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Oturum açmanız gerekiyor') =>
  new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Bu işlem için yetkiniz yok') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Kayıt bulunamadı') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);
