export interface EntityConflictPolicy<T> {
  resolveCanonicalEntity(incoming: T, stored: T | undefined): T;
  removesEntity(entity: T): boolean;
  clear(): void;
}

const IDENTITY_CONFLICT_POLICY: EntityConflictPolicy<unknown> = {
  resolveCanonicalEntity: (incoming) => incoming,
  removesEntity: () => false,
  clear: () => undefined,
};

export const identityConflictPolicy = <T>(): EntityConflictPolicy<T> =>
  IDENTITY_CONFLICT_POLICY as EntityConflictPolicy<T>;

export type TombstoneConflictPolicyOptions<T> = {
  getEntityId: (entity: T) => string;
  isTombstone: (entity: T) => boolean;
  shouldReplace: (incoming: T, stored: T) => boolean;
};

export class TombstoneConflictPolicy<T> implements EntityConflictPolicy<T> {
  private readonly getEntityId: (entity: T) => string;
  private readonly isTombstone: (entity: T) => boolean;
  private readonly shouldReplace: (incoming: T, stored: T) => boolean;
  private tombstones = new Map<string, T>();

  constructor({
    getEntityId,
    isTombstone,
    shouldReplace,
  }: TombstoneConflictPolicyOptions<T>) {
    this.getEntityId = getEntityId;
    this.isTombstone = isTombstone;
    this.shouldReplace = shouldReplace;
  }

  resolveCanonicalEntity(incoming: T, stored: T | undefined): T {
    const id = this.getEntityId(incoming);
    const current = stored ?? this.tombstones.get(id);
    const resolved =
      current === undefined || this.shouldReplace(incoming, current) ? incoming : current;
    if (this.removesEntity(resolved)) this.tombstones.set(id, resolved);
    else this.tombstones.delete(id);
    return resolved;
  }

  removesEntity(entity: T): boolean {
    return this.isTombstone(entity);
  }

  clear(): void {
    this.tombstones.clear();
  }
}
