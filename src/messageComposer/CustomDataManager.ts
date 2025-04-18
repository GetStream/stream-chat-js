import type { CustomMessageData, DraftMessage, LocalMessage } from '..';
import { StateStore } from '..';
import type { MessageComposer } from './messageComposer';

export type CustomDataManagerState = {
  data: CustomMessageData;
};

export type CustomDataManagerOptions = {
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
};

const initState = (options: CustomDataManagerOptions): CustomDataManagerState => {
  if (!options) return { data: {} as CustomMessageData };
  return { data: {} as CustomMessageData };
};

export class CustomDataManager {
  composer: MessageComposer;
  state: StateStore<CustomDataManagerState>;

  constructor({ composer, message }: CustomDataManagerOptions) {
    this.composer = composer;
    this.state = new StateStore<CustomDataManagerState>(initState({ composer, message }));
  }

  get data() {
    return this.state.getLatestValue().data;
  }

  isDataEqual = (
    nextState: CustomDataManagerState,
    previousState?: CustomDataManagerState,
  ) => JSON.stringify(nextState.data) === JSON.stringify(previousState?.data);

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ composer: this.composer, message }));
  };

  setData(data: Partial<CustomMessageData>) {
    this.state.partialNext({
      data: {
        ...this.state.getLatestValue().data,
        ...data,
      },
    });
  }
}
