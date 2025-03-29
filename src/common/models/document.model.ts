import { ProcessingStatusEnums } from '../enums/processing-status.enums';

export default class DocumentModel {
  id?: string;
  status?: ProcessingStatusEnums;
  fileKey?: string;
  fileName?: string;
  url?: string;
  size?: number;
  mimeType?: string;
  errorInfo?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(data: any) {
    this.id = data.id ?? data._id;
    this.status = data.status;
    this.fileKey = data.fileKey;
    this.fileName = data.fileName;
    this.url = data.url;
    this.size = data.size;
    this.mimeType = data.mimeType;
    this.errorInfo = data.errorInfo;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
