export type User<T = { [key: string]: unknown }> = T & {
  id: string;
  role?: string;
};
