import { StateStore } from '..';
import type {
  CustomMessageComposerData,
  CustomMessageData,
  DraftMessage,
  LocalMessage,
} from '..';
import type { MessageComposer } from './messageComposer';
import type { DeepPartial } from '../types.utility';

export type CustomDataManagerState = {
  message: CustomMessageData;
  custom: CustomMessageComposerData;
};

export type CustomDataManagerOptions = {
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
};

const initState = (options: CustomDataManagerOptions): CustomDataManagerState => {
  if (!options)
    return { message: {} as CustomMessageData, custom: {} as CustomMessageComposerData };
  return { message: {} as CustomMessageData, custom: {} as CustomMessageComposerData };
};

export class CustomDataManager {
  composer: MessageComposer;
  state: StateStore<CustomDataManagerState>;

  constructor({ composer, message }: CustomDataManagerOptions) {
    this.composer = composer;
    this.state = new StateStore<CustomDataManagerState>(initState({ composer, message }));
  }

  get customMessageData() {
    return this.state.getLatestValue().message;
  }

  get customComposerData() {
    return this.state.getLatestValue().custom;
  }

  isMessageDataEqual = (
    nextState: CustomDataManagerState,
    previousState?: CustomDataManagerState,
  ) => JSON.stringify(nextState.message) === JSON.stringify(previousState?.message);

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ composer: this.composer, message }));
  };

  setMessageData(data: DeepPartial<CustomMessageData>) {
    this.state.partialNext({
      message: {
        ...this.state.getLatestValue().message,
        ...data,
      },
    });
  }

  setCustomData(data: DeepPartial<CustomMessageComposerData>) {
    this.state.partialNext({
      custom: {
        ...this.state.getLatestValue().custom,
        ...data,
      },
    });
  }
}
