import { StreamChat } from './client';
import {
  DefaultGenerics,
  ExtendableGenerics,
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

export class Segment<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  type: SegmentType;
  id: string | null;
  client: StreamChat<StreamChatGenerics>;
  data?: SegmentData | SegmentResponse;

  constructor(client: StreamChat<StreamChatGenerics>, type: SegmentType, id: string | null, data?: SegmentData) {
    this.client = client;
    this.type = type;
    this.id = id;
    this.data = data;
  }

  async create() {
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

  async get() {
    this.verifySegmentId();
    return this.client.getSegment(this.id as string);
  }

  async update(data: Partial<SegmentUpdatableFields>) {
    this.verifySegmentId();

    return this.client.updateSegment(this.id as string, data);
  }

  async addTargets(targets: string[]) {
    this.verifySegmentId();
    return this.client.addSegmentTargets(this.id as string, targets);
  }

  async removeTargets(targets: string[]) {
    this.verifySegmentId();
    return this.client.removeSegmentTargets(this.id as string, targets);
  }

  async delete() {
    this.verifySegmentId();
    return this.client.deleteSegment(this.id as string);
  }

  async targetExists(targetId: string) {
    this.verifySegmentId();
    return this.client.segmentTargetExists(this.id as string, targetId);
  }

  async queryTargets(filter: QuerySegmentTargetsFilter | null = {}, sort: SortParam[] | null | [] = [], options = {}) {
    this.verifySegmentId();

    return this.client.querySegmentTargets(this.id as string, filter, sort, options);
  }
}
