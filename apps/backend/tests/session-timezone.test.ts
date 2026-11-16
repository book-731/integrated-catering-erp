import { describe, expect, it } from 'vitest';
import { assertUtcSession, withUtcSession } from '../src/lib/session-timezone.js';

const opts = (url: string) => new URL(url).searchParams.get('options');

describe('withUtcSession', () => {
  it('沒有 options 時加上 UTC', () => {
    expect(opts(withUtcSession('postgresql://u:p@127.0.0.1:55432/restaurant_erp'))).toBe(
      '-c TimeZone=UTC',
    );
  });
  it('保留既有 options 並把 UTC 放最後', () => {
    const url = 'postgresql://u:p@h:1/db?options=-c%20statement_timeout%3D5000';
    expect(opts(withUtcSession(url))).toBe('-c statement_timeout=5000 -c TimeZone=UTC');
  });
  it('既有台北時區會被後面的 UTC 覆蓋', () => {
    const url = 'postgresql://u:p@h:1/db?options=-c%20TimeZone%3DAsia%2FTaipei';
    expect(opts(withUtcSession(url))).toBe('-c TimeZone=Asia/Taipei -c TimeZone=UTC');
  });
  it('已有 UTC 時重複追加仍以 UTC 結尾', () => {
    const url = 'postgresql://u:p@h:1/db?options=-c%20TimeZone%3DUTC';
    expect(opts(withUtcSession(url))?.endsWith('-c TimeZone=UTC')).toBe(true);
  });
  it('保留其他參數與帳密編碼', () => {
    const out = new URL(withUtcSession('postgresql://u:p%40ss%25@h:1/db?schema=public'));
    expect(out.searchParams.get('schema')).toBe('public');
    expect(out.password).toBe('p%40ss%25');
    expect(out.username).toBe('u');
    expect(out.pathname).toBe('/db');
  });
});

describe('assertUtcSession', () => {
  it('UTC 通過', () => expect(() => assertUtcSession('UTC')).not.toThrow());
  it('非 UTC 丟出以「資料庫」開頭的錯誤', () => {
    expect(() => assertUtcSession('Asia/Taipei')).toThrow(
      /^資料庫連線時區必須是 UTC，目前為 Asia\/Taipei。$/,
    );
  });
});
