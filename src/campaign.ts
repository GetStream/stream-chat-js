import { StreamChat } from './client';
import { CampaignData, DefaultGenerics, ExtendableGenerics } from './types';

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
      sender_mode: this.data?.sender_mode,
      channel_template: this.data?.channel_template,
      create_channels: this.data?.create_channels,
      description: this.data?.description,
      name: this.data?.name,
      user_ids: this.data?.user_ids,
    };

    const result = await this.client.createCampaign(body);

    this.id = result.campaign.id;
    this.data = result.campaign;
    return result;
  }

  verifyCampaignId() {
    if (!this.id) {
      throw new Error(
        'Campaign id is missing. Either create the campaign using campaign.create() or set the id during instantiation - const campaign = client.campaign(id)',
      );
    }
  }

  async start(options?: { scheduledFor?: string; stopAt?: string }) {
    this.verifyCampaignId();

    return await this.client.startCampaign(this.id as string, options);
  }

  async update(data: Partial<CampaignData>) {
    this.verifyCampaignId();

    return this.client.updateCampaign(this.id as string, data);
  }

  async delete() {
    this.verifyCampaignId();

    return await this.client.deleteCampaign(this.id as string);
  }

  async stop() {
    this.verifyCampaignId();

    return this.client.stopCampaign(this.id as string);
  }

  async get() {
    this.verifyCampaignId();

    return this.client.getCampaign(this.id as string);
  }
}
