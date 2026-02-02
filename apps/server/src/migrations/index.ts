import * as migration_20260202_210105 from './20260202_210105';

export const migrations = [
  {
    up: migration_20260202_210105.up,
    down: migration_20260202_210105.down,
    name: '20260202_210105'
  },
];
