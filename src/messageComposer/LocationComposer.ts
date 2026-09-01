import { StateStore } from '../store';
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
 * Composer state holds a location in the shape the API accepts *back* — the fields
 * `SharedLocation` declares, plus the `message_id` the SDK has always sent alongside them.
 *
 * A location read off a message is the other shape: it carries `channel_cid`, `user_id`,
 * `created_at` and `updated_at` too, and its `end_at` is a unix-**nanosecond** number rather than a
 * `Date`. Narrowing here rather than at each send site is what stops those response-only fields
 * riding along into the next composition and reaching the API as raw nanosecond numbers — which is
 * not a type error, because {@link LiveLocationPreview} omits `end_at` and so accepts an object
 * carrying a numeric one.
 */
const initState = ({
  message,
}: {
  message?: DraftMessage | LocalMessage;
}): LocationComposerState => {
  const location = message?.shared_location;
  if (!location) return { location: null };
  // Guarded: an absent or non-finite `end_at` leaves the location static rather than producing an
  // `Invalid Date` that would later serialize as `null`.
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
      // Listed field by field rather than spread, so this can only ever return what a
      // `SharedLocation` request declares. The spread it replaces was how a response-shaped
      // location reached the API: it carried the response's own `created_at` / `updated_at` /
      // `channel_cid` / `user_id` straight into the outgoing payload.
      return {
        created_by_device_id: location.created_by_device_id,
        latitude: location.latitude,
        longitude: location.longitude,
        message_id: location.message_id,
        // Two ways to express an expiry, and they must not be conflated. A `durationMs` is a
        // duration, so it resolves against the clock at composition time (see `setData`). An
        // `end_at` is already absolute — keep it, rather than recomputing it, or editing a message
        // would push its live location's expiry out by however long the edit took. Dropping it
        // instead (what the previous `end_at: undefined` did whenever `durationMs` was absent,
        // which is always the case for a location hydrated from a message) silently turned a live
        // location into a static one on every edit.
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
