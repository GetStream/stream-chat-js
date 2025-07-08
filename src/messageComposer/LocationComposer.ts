import { StateStore } from '../store';
import type { MessageComposer } from './messageComposer';
import type {
  DraftMessage,
  LiveLocationPayload,
  LocalMessage,
  StaticLocationPayload,
} from '../types';

export type Coords = { latitude: number; longitude: number };

export type LocationComposerOptions = {
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
};

export type StaticLocationComposerLocation = Omit<StaticLocationPayload, 'end_at'> & {
  durationMs?: number;
};

export type LiveLocationComposerLocation = Omit<LiveLocationPayload, 'end_at'> & {
  durationMs?: number;
};

export type LocationComposerState = {
  location: StaticLocationComposerLocation | LiveLocationComposerLocation | null;
};

const initState = ({
  message,
}: {
  message?: DraftMessage | LocalMessage;
}): LocationComposerState => ({
  location: message?.shared_location ?? null,
});

export class LocationComposer {
  readonly state: StateStore<LocationComposerState>;
  readonly composer: MessageComposer;
  private _deviceId: string;

  constructor({ composer, message }: LocationComposerOptions) {
    this.composer = composer;
    this.state = new StateStore<LocationComposerState>(initState({ message }));
    this._deviceId = this.config.getDeviceId();
  }

  get config() {
    return this.composer.config.location;
  }

  get deviceId() {
    return this._deviceId;
  }

  get location() {
    return this.state.getLatestValue().location;
  }

  get validLocation(): StaticLocationPayload | LiveLocationPayload | null {
    const { durationMs, ...location } =
      this.location ??
      ({} as StaticLocationComposerLocation | LiveLocationComposerLocation);
    if (
      !!location?.created_by_device_id &&
      location.message_id &&
      location.latitude &&
      location.longitude
    ) {
      return {
        ...location,
        end_at: durationMs && new Date(Date.now() + durationMs).toISOString(),
      } as StaticLocationPayload | LiveLocationPayload;
    }
    return null;
  }

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ message }));
  };

  setData = (data: { durationMs?: number } & Coords) => {
    if (!this.config.enabled) return;

    this.state.partialNext({
      location: {
        ...data,
        message_id: this.composer.id,
        created_by_device_id: this.deviceId,
      },
    });
  };
}
