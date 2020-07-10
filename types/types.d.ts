export type User<T = { [key: string]: unknown }> = T & {
  id: string;
  role?: string;
};

export type TokenOrProvider = string | TokenProvider | null | undefined;
export type TokenProvider = () => Promise<string>;

export type ConnectionChangeEvent = {
  type: 'connection.changed' | 'connection.recovered';
  online?: boolean;
};

export type Logger = (
  logLevel: 'info' | 'error',
  message: string,
  extraData?: Record<string, unknown>,
) => void;
