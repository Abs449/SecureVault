// Map Firebase error codes to messages a person can act on. Shared with the extension.

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or account password.',
  'auth/invalid-login-credentials': 'Incorrect email or account password.',
  'auth/wrong-password': 'Incorrect email or account password.',
  'auth/user-not-found': 'Incorrect email or account password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Account password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/user-disabled': 'This account has been disabled.',
  'permission-denied': 'Access denied by the server.',
  unavailable: 'The server is unreachable. Check your connection and try again.',
};

export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  const message = (error as { message?: string })?.message;
  return message?.replace(/^Firebase:\s*/, '').replace(/\s*\(.*\)\.?$/, '') || 'Something went wrong. Try again.';
}
