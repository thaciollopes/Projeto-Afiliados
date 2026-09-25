export class AppError extends Error {
  constructor(message, status = 400, code = 'APP_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Registro') =>
  new AppError(`${what} nao encontrado`, 404, 'NOT_FOUND');

export const badRequest = (msg, details = null) =>
  new AppError(msg, 400, 'BAD_REQUEST', details);

export const conflict = (msg) => new AppError(msg, 409, 'CONFLICT');
