export class TrustedRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
