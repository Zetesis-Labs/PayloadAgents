import * as migration_20260202_210105 from './20260202_210105';
import * as migration_20260214_001804 from './20260214_001804';

export const migrations = [
  {
    up: migration_20260202_210105.up,
    down: migration_20260202_210105.down,
    name: '20260202_210105',
  },
  {
    up: migration_20260214_001804.up,
    down: migration_20260214_001804.down,
    name: '20260214_001804'
  },
];
