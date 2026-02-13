import * as migration_20260213_124051_initial from './20260213_124051_initial';

export const migrations = [
  {
    up: migration_20260213_124051_initial.up,
    down: migration_20260213_124051_initial.down,
    name: '20260213_124051_initial'
  },
];
