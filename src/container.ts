import CommonBootrapper from './common/common.bootstrapper';
import TranscodingBootstrapper from './modules/transcoding/transcoding.bootstrapper';
import { Container } from 'inversify';

export default class GlobalContainer {
  private static container: Container;

  public static initializeContainers(): void {
    GlobalContainer.container = new Container();
    CommonBootrapper.initialize(GlobalContainer.container);
    TranscodingBootstrapper.initialize(GlobalContainer.container);
  }

  public static getInstance(): Container {
    if (!GlobalContainer.container) {
      GlobalContainer.container = new Container();
    }
    return GlobalContainer.container;
  }
}
