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

/**
 * Creates a development token for `userId`: an unsigned JWT the API accepts only while the app
 * has auth checks disabled (`disable_auth_checks`). Never use one in production.
 *
 * @param userId - The id of the user the token is for.
 * @returns The development token.
 */
export function DevToken(userId: string) {
  // Base64 of the UTF-8 bytes, so a non-Latin-1 id can't make `btoa` throw.
  const payload = String.fromCharCode(
    ...new TextEncoder().encode(JSON.stringify({ user_id: userId })),
  );
  return [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', // {"alg": "HS256", "typ": "JWT"}
    btoa(payload),
    'devtoken', // fixed signature
  ].join('.');
}
