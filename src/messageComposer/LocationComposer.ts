import { StateStore } from '@stream-io/state-store';
import type { MessageComposer } from './messageComposer';
import type { DraftMessage, LocalMessage, SharedLocation } from '../types';
import { convertTimestampToDate } from '../utils/time';

export type Coords = { latitude: number; longitude: number };

export type LocationComposerOptions = {
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
};

export type StaticLocationPreview = SharedLocation & {
  message_id?: string;
};

export type LiveLocationPreview = Omit<SharedLocation, 'end_at'> & {
  durationMs?: number;
  message_id?: string;
};

export type LocationComposerState = {
  location: StaticLocationPreview | LiveLocationPreview | null;
};

export type LocationComposerSnapshot = LocationComposerState;

/**
 * Keeps only the request-shaped fields of a message's location (plus `message_id`), so response-only
 * fields (`channel_cid`, `user_id`, nanosecond `end_at`) never reach the next composition.
 */
const initState = ({
  message,
}: {
  message?: DraftMessage | LocalMessage;
}): LocationComposerState => {
  const location = message?.shared_location;
  if (!location) return { location: null };
  // An absent or non-finite `end_at` leaves the location static (no `Invalid Date`).
  const endAt = convertTimestampToDate(location.end_at);
  return {
    location: {
      created_by_device_id: location.created_by_device_id,
      latitude: location.latitude,
      longitude: location.longitude,
      message_id: location.message_id,
      ...(endAt ? { end_at: endAt } : {}),
    },
  };
};

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

  get validLocation(): StaticLocationPreview | null {
    const location = (this.location ?? {}) as LiveLocationPreview &
      Pick<StaticLocationPreview, 'end_at'>;
    const { durationMs, end_at } = location;
    if (
      !!location?.created_by_device_id &&
      location.message_id &&
      location.latitude &&
      location.longitude &&
      (typeof durationMs === 'undefined' || durationMs >= this.config.minShareDurationMs)
    ) {
      // Field by field, so only what a `SharedLocation` request declares is sent.
      return {
        created_by_device_id: location.created_by_device_id,
        latitude: location.latitude,
        longitude: location.longitude,
        message_id: location.message_id,
        // A `durationMs` resolves against the clock when read. An existing `end_at` is kept as is, so
        // editing a message does not extend (or drop) its live location's expiry.
        ...(typeof durationMs === 'number'
          ? { end_at: new Date(Date.now() + durationMs) }
          : end_at
            ? { end_at }
            : {}),
      };
    }
    return null;
  }

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ message }));
  };

  /**
   * Takes over `source`'s location, re-keyed to this composer's message (`message_id`).
   *
   * @internal
   */
  takeOver = (source: LocationComposer) => {
    const { location } = source.state.getLatestValue();
    this.state.next({
      location: location && { ...location, message_id: this.composer.id },
    });
  };

  getSnapshot = (): LocationComposerSnapshot => this.state.getLatestValue();

  restoreSnapshot = (snapshot: LocationComposerSnapshot) => {
    this.state.next(snapshot);
  };

  setData = (data: { durationMs?: number } & Coords) => {
    if (!this.config.enabled) return;
    if (!data.latitude || !data.longitude) return;

    this.state.partialNext({
      location: {
        ...data,
        message_id: this.composer.id,
        created_by_device_id: this.deviceId,
      },
    });
  };
}
