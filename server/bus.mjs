import { EventEmitter } from 'node:events';
import { queries } from './db.mjs';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

/* Convenience: append to DB + broadcast in one call. */
export function log(lv, text) {
  const row = queries.appendLog({ lv, text });
  bus.emit('log', row);
  return row;
}
