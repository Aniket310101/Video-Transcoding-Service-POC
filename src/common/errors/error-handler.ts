import { ErrorCodeEnums, ErrorNameEnums } from './error-enums';

export default class ErrorHandler extends Error {
  statusCode: number;

  constructor(statusCode: ErrorCodeEnums, message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.statusCode = statusCode
      ? statusCode
      : ErrorCodeEnums.INTERNAL_SERVER_ERROR;
    switch (statusCode) {
      case ErrorCodeEnums.BAD_REQUEST:
        this.name = ErrorNameEnums.ARGUMENT_VALIDATION_ERROR;
        break;
      case ErrorCodeEnums.UNAUTHORIZED:
        this.name = ErrorNameEnums.UNAUTHORIZED;
        break;
      case ErrorCodeEnums.FORBIDDEN:
        this.name = ErrorNameEnums.FORBIDDEN;
        break;
      case ErrorCodeEnums.NOT_FOUND:
        this.name = ErrorNameEnums.NOT_FOUND;
        break;
      case ErrorCodeEnums.INTERNAL_SERVER_ERROR:
        this.name = ErrorNameEnums.INTERNAL_SERVER_ERROR;
        break;
      case ErrorCodeEnums.TEMPORARY_REDIRECT:
        this.name = ErrorNameEnums.TEMPORARY_REDIRECT;
        break;
      default:
        this.name = ErrorNameEnums.INTERNAL_SERVER_ERROR;
        this.statusCode = ErrorCodeEnums.INTERNAL_SERVER_ERROR;
    }
    Error.captureStackTrace(this);
  }
}
