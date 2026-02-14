import * as migration_20260213_124051_initial from './20260213_124051_initial'
import * as migration_20260214_001804 from './20260214_001804'

export const migrations = [
  {
    up: migration_20260213_124051_initial.up,
    down: migration_20260213_124051_initial.down,
    name: '20260213_124051_initial'
  },
  {
    up: migration_20260214_001804.up,
    down: migration_20260214_001804.down,
    name: '20260214_001804'
  }
]
