/** Allowed browser origins from a comma-separated env value. Shared by HTTP CORS and the WebSocket gateway. */
export function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}
