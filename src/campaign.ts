import { StreamChat } from './client';
import { APIResponse, CampaignData, DefaultGenerics, ExtendableGenerics } from './types';

export class Campaign<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  id: string | null;
  data?: CampaignData;
  client: StreamChat<StreamChatGenerics>;

  constructor(client: StreamChat<StreamChatGenerics>, id: string | null, data?: CampaignData) {
    this.client = client;
    this.id = id;
    this.data = data;
  }

  async create() {
    const body = {
      id: this.id,
      message_template: this.data?.message_template,
      segment_ids: this.data?.segment_ids,
      sender_id: this.data?.sender_id,
      channel_template: this.data?.channel_template,
      create_channels: this.data?.create_channels,
      description: this.data?.description,
      name: this.data?.name,
      scheduled_for: this.data?.scheduled_for,
      user_ids: this.data?.user_ids,
    };

    const result = await this.client.createCampaign(body);

    this.id = result.campaign.id;
    this.data = result.campaign;
    return result;
  }

  async start() {
    if (!this.id) {
      throw new Error('id is not set');
    }

    return await this.client.startCampaign(this.id);
  }

  async update(data: Partial<CampaignData>) {
    if (!this.id) {
      throw new Error('id is not set');
    }

    return this.client.updateCampaign(this.id, data);
  }

  async delete() {
    return await this.client.delete<APIResponse>(this.client.baseURL + `/campaigns/${this.id}`);
  }

  async schedule(params: { scheduledFor: number }) {
    const { scheduledFor } = params;
    const { campaign } = await this.client.patch<{ campaign: Campaign }>(
      this.client.baseURL + `/campaigns/${this.id}/schedule`,
      {
        scheduled_for: scheduledFor,
      },
    );
    return campaign;
  }

  async stop() {
    return this.client.patch<{ campaign: Campaign }>(this.client.baseURL + `/campaigns/${this.id}/stop`);
  }

  async pause() {
    return this.client.patch<{ campaign: Campaign }>(this.client.baseURL + `/campaigns/${this.id}/pause`);
  }

  async resume() {
    return this.client.patch<{ campaign: Campaign }>(this.client.baseURL + `/campaigns/${this.id}/resume`);
  }

  async get() {
    if (!this.id) {
      throw new Error('id is not set');
    }

    return this.client.getCampaign(this.id);
  }
}
