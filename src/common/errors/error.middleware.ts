import { NextFunction } from 'express';
import * as Express from 'express';
import ErrorHandler from './error-handler';

export const ErrorMiddleware = (
  err: ErrorHandler,
  req: Express.Request,
  res: Express.Response,
  next: NextFunction,
): void => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ error: err.name, message: err.message });
};
