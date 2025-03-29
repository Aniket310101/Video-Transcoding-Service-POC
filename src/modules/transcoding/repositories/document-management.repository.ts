import BaseDatastore from '../../../common/datastore/base-datastore';
import { ProcessingStatusEnums } from '../../../common/enums/processing-status.enums';
import { ErrorCodeEnums } from '../../../common/errors/error-enums';
import ErrorHandler from '../../../common/errors/error-handler';
import DocumentModel from '../../../common/models/document.model';
import { IDocumentManagementRepository } from '../transcoding.interfaces';

export default class DocumentManagementRepository
  extends BaseDatastore
  implements IDocumentManagementRepository
{
  async createDocument(data: DocumentModel): Promise<DocumentModel> {
    let document;
    try {
      document = await new BaseDatastore.documentsDB(data).save();
    } catch (error) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        'Error in creating document object!',
      );
    }
    return new DocumentModel(document);
  }

  async getDocumentById(id: string): Promise<DocumentModel> {
    try {
      const document = await BaseDatastore.documentsDB.findById(id);
      return new DocumentModel(document);
    } catch (error) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        'Error in getting processing request by ID!',
      );
    }
  }

  async updateDocument(
    id: string,
    data: DocumentModel,
  ): Promise<DocumentModel> {
    try {
      const document = await BaseDatastore.documentsDB.findByIdAndUpdate(
        id,
        data,
      );
      return new DocumentModel(document);
    } catch (error) {
      throw new ErrorHandler(
        ErrorCodeEnums.INTERNAL_SERVER_ERROR,
        'Error in updating document!',
      );
    }
  }
}
