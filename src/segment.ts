import { StreamChat } from './client';
import { DefaultGenerics, ExtendableGenerics, SegmentData, SegmentResponse } from './types';

type SegmentType = 'user' | 'channel';

type SegmentUpdatableFields = {
  description?: string;
  filter?: {};
  name?: string;
};

export class Segment<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  type: SegmentType;
  id?: string | null;
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
      id: this.id,
      type: this.type,
      name: this.data?.name,
      filter: this.data?.filter,
      description: this.data?.description,
    };

    return this.client.post<{ segment: SegmentResponse }>(this.client.baseURL + `/segments`, body);
  }

  async update(data: Partial<SegmentUpdatableFields>) {
    if (!this.id) {
      throw new Error('id is not set');
    }

    return this.client.updateSegment(this.id, data);
  }

  async addTargets(targets: string[]) {
    if (!this.id) {
      throw new Error('id is not set');
    }
    return this.client.addSegmentTargets(this.id, targets);
  }

  async deleteTargets(targets: string[]) {
    if (!this.id) {
      throw new Error('id is not set');
    }
    return this.client.deleteSegmentTargets(this.id, targets);
  }

  async delete() {
    if (!this.id) {
      throw new Error('id is not set');
    }
    return this.client.deleteSegment(this.id);
  }

  async targetExists(targetId: string) {
    if (!this.id) {
      throw new Error('id is not set');
    }
    return this.client.segmentTargetExists(this.id, targetId);
  }
}
