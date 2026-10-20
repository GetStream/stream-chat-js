/**
 * Returns the `user_id` embedded in a JWT (the signature is not verified), or an empty string when
 * the token does not have three dot-separated segments.
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
