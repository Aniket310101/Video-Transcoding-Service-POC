import { Container } from 'inversify';
import DocumentManagementService from './services/document-management.service';
import { TranscodingTypes } from './transcoding.types';
import {
  IDocumentManagementRepository,
  IDocumentManagementService,
  IVideoTranscodingService,
} from './transcoding.interfaces';
import DocumentManagementRepository from './repositories/document-management.repository';
import VideoTranscodingService from './services/video-transcoding.service';

export default class TranscodingBootstrapper {
  public static initialize(container: Container) {
    this.registerDependencies(container);
    this.initializeWorkers(container);
  }

  private static registerDependencies(container: Container) {
    container
      .bind<IDocumentManagementService>(TranscodingTypes.TranscodingService)
      .to(DocumentManagementService);
    container
      .bind<IDocumentManagementRepository>(
        TranscodingTypes.TranscodingRepository,
      )
      .to(DocumentManagementRepository);
    container
      .bind<IVideoTranscodingService>(TranscodingTypes.VideoTranscodingService)
      .to(VideoTranscodingService);
  }

  private static async initializeWorkers(container: Container) {}
}
