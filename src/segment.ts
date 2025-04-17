import type { StreamChat } from './client';
import type {
  QuerySegmentTargetsFilter,
  SegmentData,
  SegmentResponse,
  SortParam,
} from './types';

type SegmentType = 'user' | 'channel';

type SegmentUpdatableFields = {
  description?: string;
  filter?: {};
  name?: string;
};

export class Segment {
  type: SegmentType;
  id: string | null;
  client: StreamChat;
  data?: SegmentData | SegmentResponse;

  constructor(
    client: StreamChat,
    type: SegmentType,
    id: string | null,
    data?: SegmentData,
  ) {
    this.client = client;
    this.type = type;
    this.id = id;
    this.data = data;
  }

  create() {
    const body = {
      name: this.data?.name,
      filter: this.data?.filter,
      description: this.data?.description,
      all_sender_channels: this.data?.all_sender_channels,
      all_users: this.data?.all_users,
    };

    return this.client.createSegment(this.type, this.id, body);
  }

  verifySegmentId() {
    if (!this.id) {
      throw new Error(
        'Segment id is missing. Either create the segment using segment.create() or set the id during instantiation - const segment = client.segment(id)',
      );
    }
  }

  get() {
    this.verifySegmentId();
    return this.client.getSegment(this.id as string);
  }

  update(data: Partial<SegmentUpdatableFields>) {
    this.verifySegmentId();

    return this.client.updateSegment(this.id as string, data);
  }

  addTargets(targets: string[]) {
    this.verifySegmentId();
    return this.client.addSegmentTargets(this.id as string, targets);
  }

  removeTargets(targets: string[]) {
    this.verifySegmentId();
    return this.client.removeSegmentTargets(this.id as string, targets);
  }

  delete() {
    this.verifySegmentId();
    return this.client.deleteSegment(this.id as string);
  }

  targetExists(targetId: string) {
    this.verifySegmentId();
    return this.client.segmentTargetExists(this.id as string, targetId);
  }

  queryTargets(
    filter: QuerySegmentTargetsFilter | null = {},
    sort: SortParam[] | null | [] = [],
    options = {},
  ) {
    this.verifySegmentId();

    return this.client.querySegmentTargets(this.id as string, filter, sort, options);
  }
}
