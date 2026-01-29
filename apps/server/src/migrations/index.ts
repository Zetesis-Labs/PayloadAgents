import * as migration_20260129_000559 from './20260129_000559';

export const migrations = [
  {
    up: migration_20260129_000559.up,
    down: migration_20260129_000559.down,
    name: '20260129_000559'
  },
];
