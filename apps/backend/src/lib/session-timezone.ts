export const UTC_SESSION_OPTION = '-c TimeZone=UTC';

export function withUtcSession(connectionString: string): string {
  const url = new URL(connectionString);
  const existingOptions = url.searchParams.get('options')?.trim();

  url.searchParams.set(
    'options',
    existingOptions ? `${existingOptions} ${UTC_SESSION_OPTION}` : UTC_SESSION_OPTION,
  );

  return url.href;
}

export function assertUtcSession(timeZone: string): void {
  if (timeZone !== 'UTC') {
    throw new Error(`資料庫連線時區必須是 UTC，目前為 ${timeZone}。`);
  }
}
