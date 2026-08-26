export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * The keys of every union member, not only those common to all — which is what `keyof (A | B)` gives.
 * Distribution needs a naked type parameter: the same conditional written inline over a concrete union
 * silently yields the common keys instead.
 */
export type KeysOfUnion<T> = T extends unknown ? keyof T : never;

/** The type `Key` has in each union member declaring it; members without it drop out as `never`. */
export type ValueOfUnion<T, Key extends PropertyKey> = T extends unknown
  ? Key extends keyof T
    ? T[Key]
    : never
  : never;
