import { z } from 'zod';
import { getJson, sendJson } from './client';
const envelope = z.object({ success: z.literal(true), data: z.unknown(), requestId: z.string() });
export type Row = Record<string, unknown>;
export function row(v: unknown): Row {
  return z.record(z.string(), z.unknown()).parse(v);
}
export const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(row) : []);
export const value = (v: unknown) => (v === null || v === undefined ? '' : String(v));
export const label = (v: unknown) => (v && typeof v === 'object' ? value(row(v).name) : value(v));
export const opsGet = async (path: string, signal?: AbortSignal) =>
  (await getJson(`/operations${path}`, envelope, signal)).data;
export const opsSend = async (path: string, body: Row, method: 'POST' | 'PUT' = 'POST') =>
  (await sendJson(`/operations${path}`, method, body, envelope)).data;
export async function choices(path: string) {
  const all: Row[] = [];
  for (let page = 1; page <= 10000; page++) {
    const data = row(
      path.startsWith('ops:')
        ? await opsGet(`${path.slice(4)}?pageSize=100&page=${page}`)
        : (await getJson(`${path}?pageSize=100&page=${page}`, envelope)).data,
    );
    all.push(...rows(data.items));
    if (all.length >= Number(data.total)) return all;
  }
  throw Error('選項數量過多，請縮小範圍。');
}
