/**
 * Decodes a JWT token and returns the embedded `user_id`.
 *
 * @param token - The JWT token to decode.
 * @returns The `user_id` extracted from the token's payload, or an empty string when the token is malformed.
 */
export function UserFromToken(token: string) {
  const fragments = token.split('.');
  if (fragments.length !== 3) {
    return '';
  }
  const b64Payload = fragments[1];
  const payload = atob(b64Payload);
  const data = JSON.parse(payload);
  return data.user_id as string;
}
