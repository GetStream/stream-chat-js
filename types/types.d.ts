export type User<T = { [key: string]: unknown }> = T & {
  id: string;
  role?: string;
};

export type TokenOrProvider = string | TokenProvider | null | undefined;
export type TokenProvider = () => Promise<string>;
