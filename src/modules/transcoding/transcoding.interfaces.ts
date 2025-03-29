import DocumentModel from '../../common/models/document.model';
import { Request } from 'express';
import BaseDatastore from '../../common/datastore/base-datastore';

export interface IDocumentManagementService {
  uploadFile(req: Request): Promise<DocumentModel>;
  getDocument(id: string): Promise<DocumentModel>;
}

export interface IDocumentManagementRepository extends BaseDatastore {
  createDocument(data: DocumentModel): Promise<DocumentModel>;
  getDocumentById(id: string): Promise<DocumentModel>;
  updateDocument(id: string, data: DocumentModel): Promise<DocumentModel>;
}

export interface IVideoTranscodingService {
  transcodeVideo(): Promise<void>;
  stopProcessing(): Promise<void>;
}
