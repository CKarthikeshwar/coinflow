/** CR-31 — `searchNotesByPrefix` against real in-memory SQLite (LIKE, escaping, grouping and ordering are SQL-level). */

import { insertTransaction } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import { searchNotesByPrefix } from './transactions';

let mockMem: ReturnType<typeof createMemoryDb>;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('../fts', () => ({ isFtsAvailable: () => false }));
jest.mock('@/hooks/use-live-query', () => ({ useLiveQuery: jest.fn() }));

beforeEach(() => {
  mockMem = createMemoryDb();
});

const note = (text: string | null, createdAt = 1, extra: Record<string, unknown> = {}) =>
  insertTransaction(mockMem.db, { note: text, createdAt, ...extra });

describe('searchNotesByPrefix (CR-31)', () => {
  it('matches the start of past notes, ignoring case either way', () => {
    note('French fries');
    note('Fresh juice');
    note('Momos');
    expect(searchNotesByPrefix('fre').sort()).toEqual(['French fries', 'Fresh juice']);
    expect(searchNotesByPrefix('FRE').sort()).toEqual(['French fries', 'Fresh juice']);
    expect(searchNotesByPrefix('mom')).toEqual(['Momos']);
  });

  it('only matches the start, not the middle', () => {
    note('Schezwan noodles');
    expect(searchNotesByPrefix('noo')).toEqual([]);
  });

  it('puts the most-used note first, then the most recent', () => {
    note('Fresh juice', 5);
    note('French fries', 1);
    note('French fries', 2);
    note('Frankie', 9);
    expect(searchNotesByPrefix('fr')).toEqual(['French fries', 'Frankie', 'Fresh juice']);
  });

  it('collapses the same note typed in different cases into one, keeping the latest spelling', () => {
    note('french fries', 1);
    note('French Fries', 3);
    expect(searchNotesByPrefix('fre')).toEqual(['French Fries']);
  });

  it('leaves out an exact match of what is already typed', () => {
    note('Tea');
    note('Tea and biscuits');
    expect(searchNotesByPrefix('tea')).toEqual(['Tea and biscuits']);
  });

  it('ignores deleted transactions, empty notes and a blank prefix', () => {
    note('Fries', 1, { deletedAt: 5 });
    note(null);
    expect(searchNotesByPrefix('fri')).toEqual([]);
    expect(searchNotesByPrefix('   ')).toEqual([]);
  });

  it('treats %, _ and ! in the typed text literally', () => {
    note('50% off deal');
    note('500 rupees');
    expect(searchNotesByPrefix('50%')).toEqual(['50% off deal']);
    note('a_b');
    note('axb');
    expect(searchNotesByPrefix('a_')).toEqual(['a_b']);
    note('Wow! party');
    expect(searchNotesByPrefix('wow!')).toEqual(['Wow! party']); // the escape character itself is literal too
  });

  it('returns at most `limit` notes', () => {
    for (const n of ['Fa', 'Fb', 'Fc', 'Fd', 'Fe', 'Ff']) note(n);
    expect(searchNotesByPrefix('f')).toHaveLength(4);
    expect(searchNotesByPrefix('f', 2)).toHaveLength(2);
  });
});
