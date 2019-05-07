// TypeScript Version: 2.2

export as namespace stream;

export interface APIResponse {
  duration: string;
  [propName: string]: any;
}

export interface Attachment {
  type: string;
  url: string;
  [propName: string]: any;
}

export interface Message {
  text: string;
  attachments?: Attachment[];
  mentioned_users?: User[];
  [propName: string]: any;
}

export interface User {
  id: string;
  name?: string;
  [propName: string]: any;
}

export interface Device {
  id: string;
  provider: string;
  user: User;
  [propName: string]: any;
}

export interface Event {
  cid: string;
  type: string;
  message: Message;
  reaction: Reaction;
  member: User;
  user: User;
  me: User;
  unread_count: number;
  online: number;
}

export interface Reaction {
  type: string;
  [propName: string]: any;
}

export class StreamChat {
  constructor(key: string, secretOrOptions?: string, options?: object);

  devToken(userID: string): string;
  createToken(userID: string, exp: number): string;
  getAuthType(): string;

  setBaseURL(baseURL: string): void;
  setUser(user: User, userToken: string): Promise<void>;

  updateAppSettings(options: object): Promise<object>;
  getAppSettings(): Promise<object>;
  disconnect(): void;

  setAnonymousUser(): Promise<void>;
  setGuestUser(user: User): Promise<void>;

  on(callbackOrString: string, callbackOrNothing?: any): void;
  off(callbackOrString: string, callbackOrNothing?: any): void;

  get(url: string, params: object): Promise<APIResponse>;
  put(url: string, data: object): Promise<APIResponse>;
  post(url: string, data: object): Promise<APIResponse>;
  delete(url: string, params: object): Promise<APIResponse>;
  handleResponse(response: APIResponse): APIResponse;
  errorFromResponse(response: APIResponse): Error;

  sendFile(
    url: string,
    uri: string,
    name: string,
    contentType: string,
    user: string,
  ): Promise<APIResponse>;

  dispatchEvent(event: Event): void;
  handleEvent(messageEvent: Event): void;
  recoverState(): Promise<void>;

  connect(): Promise<void>;
  queryUsers(
    filterConditions: object,
    sort: object,
    options: object,
  ): Promise<APIResponse>;
  queryChannels(
    filterConditions: object,
    sort: object,
    options: object,
  ): Promise<APIResponse>;
  search(filterConditions: object, query: object, options: object): Promise<APIResponse>;

  addDevice(id: string, push_provider: string, userID: string): Promise<APIResponse>;
  getDevices(userId: string): Promise<APIResponse>;
  removeDevice(deviceId: string): Promise<APIResponse>;

  channel(channelType: string, channelID: string, custom: object): Channel;

  updateUser(userObject: User): Promise<APIResponse>;
  updateUsers(users: User[]): Promise<APIResponse>;
  banUser(targetUserID: string, options: object): Promise<APIResponse>;
  unbanUser(targetUserID: string, options: object): Promise<APIResponse>;
  muteUser(targetUserID: string): Promise<APIResponse>;
  unmuteUser(targetUserID: string): Promise<APIResponse>;
  flagUser(userID: string): Promise<APIResponse>;
  unflagUser(userID: string): Promise<APIResponse>;
  flagMessage(messageID: string): Promise<APIResponse>;
  unflagMessage(messageID: string): Promise<APIResponse>;

  createChannelType(data: object): Promise<APIResponse>;
  getChannelType(channelType: string, data: object): APIResponse;
  updateChannelType(channelType: string, data: object): object;
  deleteChannelType(channelType: string): object;
  listChannelTypes(): APIResponse;

  updateMessage(message: Message, userId: string | User): Promise<APIResponse>;
  deleteMessage(messageID: string): Promise<APIResponse>;

  verifyWebHook(requestBody: object, xSignature: string): boolean;
}

export class ClientState {
  constructor();
  updateUser(user: User): void;
}

export class Channel {
  constructor(client: StreamChat, type: string, id: string, data: object);
  getConfig(): object;
  sendMessage(message: Message): Promise<APIResponse>;
  sendFile(
    uri: string,
    name: string,
    contentType: string,
    user: string,
  ): Promise<APIResponse>;
  sendImage(
    uri: string,
    name: string,
    contentType: string,
    user: string,
  ): Promise<APIResponse>;
  deleteFile(url: string): Promise<APIResponse>;
  deleteImage(url: string): Promise<APIResponse>;

  sendEvent(chatEvent: Event): Promise<APIResponse>;
  sendReaction(messageID: string, reaction: Reaction): Promise<APIResponse>;

  deleteReaction(
    messageID: string,
    reactionType: string,
    user_id?: string,
  ): Promise<APIResponse>;

  update(channelData: object, updateMessage: Message): Promise<APIResponse>;
  delete(): Promise<APIResponse>;
  acceptInvite(options: object): Promise<APIResponse>;
  rejectInvite(options: object): Promise<APIResponse>;
  addMembers(members: User[]): Promise<APIResponse>;
  addModerators(members: User[]): Promise<APIResponse>;
  removeMembers(members: User[]): Promise<APIResponse>;
  demoteModerators(members: User[]): Promise<User>;

  sendAction(messageID: string, formData: object): Promise<APIResponse>;
  keystroke(): Promise<APIResponse>;
  stopTyping(): Promise<APIResponse>;
  lastMessage(): Message;
  markRead(): Promise<void>;
  clean(): void;
  watch(options: object): Promise<APIResponse>;
  stopWatching(): Promise<APIResponse>;
  getReplies(parent_id: string, options: object): Promise<APIResponse>;
  getReactions(message_id: string, options: object): Promise<APIResponse>;
  countUnread(lastRead?: Date): number;
  create(): Promise<APIResponse>;
  query(options: object): Promise<APIResponse>;
  banUser(targetUserID: string, options: object): Promise<APIResponse>;
  unbanUser(targetUserID: string): Promise<APIResponse>;
  on(callbackOrString: string, callbackOrNothing: any): void;
  off(callbackOrString: string, callbackOrNothing: any): void;
}

export class ChannelState {
  constructor(channel: Channel);
  addMessageSorted(newMessage: Message): void;
  addMessagesSorted(newMessages: Message[]): void;
  removeMessage(messageToRemove: Message): boolean;
  filterErrorMessages(): object;
  clean(): void;
}

export class StableWSConnection {
  constructor(
    wsURL: string,
    clientID: string,
    userID: string,
    messageCallback: (event: object) => void,
    recoverCallback: (open: any) => void,
    eventCallback: (event: object) => void,
  );
  connect(): Promise<void>;
  disconnect(): void;
}

export class Permission {
  constructor(
    name: string,
    priority: number,
    resources: string[],
    roles: string[],
    owner: boolean,
    action: string,
  );
}

export function JWTUserToken(
  apiSecret: string,
  userId: string,
  extraData: object,
  jwtOptions: object,
): string;

export function JWTServerToken(apiSecret: string, jwtOptions: object): string;

export function UserFromToken(token: string): string;

export function DevToken(userId: string): string;

export function CheckSignature(body: any, secret: string, signature: string): boolean;

export function isValidEventType(eventType: string): boolean;

export function logChatPromiseExecution(promise: Promise<any>, name: string): void;
