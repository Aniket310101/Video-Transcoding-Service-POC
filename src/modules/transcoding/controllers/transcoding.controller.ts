import { controller, httpGet, httpPost } from 'inversify-express-utils';
import { Response, Request } from 'express';
import Busboy, { FileInfo } from 'busboy';
import ErrorHandler from '../../../common/errors/error-handler';
import { ErrorCodeEnums } from '../../../common/errors/error-enums';
import { IDocumentManagementService } from '../transcoding.interfaces';
import { TranscodingTypes } from '../transcoding.types';
import { inject } from 'inversify';
import { Readable } from 'stream';

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

@controller('/api/transcoding')
export default class TranscodingController {
  constructor(
    @inject(TranscodingTypes.TranscodingService)
    private transcodingService: IDocumentManagementService,
  ) {}

  @httpPost('/upload')
  public async upload(req: Request, res: Response): Promise<void> {
    if (!req.headers['content-type']?.includes('multipart/form-data')) {
      throw new ErrorHandler(
        ErrorCodeEnums.BAD_REQUEST,
        'Content-Type must be multipart/form-data',
      );
    }
    const document = await this.transcodingService.uploadFile(req);
    res.status(200).json(document);
  }

  @httpGet('/:id')
  public async getDocument(req: Request, res: Response): Promise<void> {
    const document = await this.transcodingService.getDocument(req.params.id);
    res.status(200).json(document);
  }
}
