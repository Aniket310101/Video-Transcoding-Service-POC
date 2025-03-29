import { Container } from 'inversify';
import BaseDatastore from './datastore/base-datastore';
import { CommonTypes } from './common.types';
import AwsS3Provider from './providers/aws-s3.provider';
import { IAwsS3Provider, IQueueProvider } from './common.interfaces';
import QueueProvider from './providers/queue.provider';

export default class CommonBootrapper {
  public static async initialize(container: Container) {
    new BaseDatastore().initializeDB();
    this.registerDependencies(container);
    this.initializeS3Provider(container);
  }

  private static registerDependencies(container: Container) {
    container
      .bind<IAwsS3Provider>(CommonTypes.AwsS3Provider)
      .to(AwsS3Provider)
      .inSingletonScope();

    container
      .bind<IQueueProvider>(CommonTypes.QueueProvider)
      .to(QueueProvider)
      .inSingletonScope();
  }

  private static initializeS3Provider(container: Container) {
    const awsS3Provider = container.get<IAwsS3Provider>(
      CommonTypes.AwsS3Provider,
    );
    awsS3Provider.initialize();

    const queueProvider = container.get<IQueueProvider>(
      CommonTypes.QueueProvider,
    );
    queueProvider.initialize();
  }
}
