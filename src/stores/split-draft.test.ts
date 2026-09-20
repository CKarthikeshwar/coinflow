import { useSplitDraft, type DraftPerson } from './split-draft';

const person = (key: string, name = key): DraftPerson => ({
  key, personId: null, name, phone: '9845897555', contactRef: null, source: 'manual',
});
const store = () => useSplitDraft.getState();

beforeEach(() => store().reset());

describe('useSplitDraft — building a split (UI-071/072)', () => {
  it('starts empty on the People stage', () => {
    store().begin(120_000);
    expect(store()).toMatchObject({ stage: 'people', people: [], totalMinor: 120_000, committed: null, mode: 'rupee' });
  });

  it('toggles people in and out, keeping order', () => {
    store().begin(1000);
    store().togglePerson(person('a'));
    store().togglePerson(person('b'));
    store().togglePerson(person('c'));
    store().togglePerson(person('b'));
    expect(store().people.map((p) => p.key)).toEqual(['a', 'c']);
  });

  it('Continue needs at least one person', () => {
    store().begin(1000);
    store().goAmounts();
    expect(store().stage).toBe('people');
    store().togglePerson(person('a'));
    store().goAmounts();
    expect(store().stage).toBe('amounts');
    store().goPeople();
    expect(store().stage).toBe('people');
  });

  it('removing a person also forgets their custom amount', () => {
    store().begin(1000);
    store().togglePerson(person('a'));
    store().setOverride('a', 300);
    store().removePerson('a');
    expect(store().people).toEqual([]);
    expect(store().overrides).toEqual({});
  });

  it('switching ₹ ↔ % clears custom amounts; setting the same mode does not', () => {
    store().begin(1000);
    store().togglePerson(person('a'));
    store().setOverride('a', 300);
    store().setMode('rupee');
    expect(store().overrides).toEqual({ a: 300 });
    store().setMode('percent');
    expect(store().overrides).toEqual({});
    expect(store().mode).toBe('percent');
  });

  it('setOverride(null) frees the row; resetEqual frees all', () => {
    store().begin(1000);
    store().togglePerson(person('a'));
    store().setOverride('a', 300);
    store().setOverride('you', 100);
    store().setOverride('a', null);
    expect(store().overrides).toEqual({ you: 100 });
    store().resetEqual();
    expect(store().overrides).toEqual({});
  });
});

describe('commit', () => {
  it('commits an equal split with each person’s amount', () => {
    store().begin(120_000);
    store().togglePerson(person('a'));
    store().togglePerson(person('b'));
    store().goAmounts();
    expect(store().commit()).toBe(true);
    expect(store().committed?.map((c) => [c.key, c.amountMinor])).toEqual([['a', 40_000], ['b', 40_000]]);
    expect(store().pending()).toMatchObject({ existingSplitId: null, removed: false, send: true });
  });

  it('refuses when the split is not balanced or someone owes ₹0, leaving committed unchanged', () => {
    store().begin(100_000);
    store().togglePerson(person('a'));
    store().setOverride('you', 30_000);
    store().setOverride('a', 30_000);
    expect(store().commit()).toBe(false);
    expect(store().committed).toBeNull();
    store().resetEqual();
    store().setOverride('a', 0);
    expect(store().commit()).toBe(false);
  });
});

describe('editing an existing split', () => {
  const shares = [
    { ...person('a', 'Rahul'), personId: 'p-a', amountMinor: 30_000 },
    { ...person('b', 'Priya'), personId: 'p-b', amountMinor: 30_000 },
  ];

  it('seedExisting shows it as committed and begin() opens on Amounts with everyone’s amount fixed', () => {
    store().seedExisting({ splitId: 's1', shares });
    expect(store().existingSplitId).toBe('s1');
    store().begin(120_000);
    expect(store()).toMatchObject({ stage: 'amounts', overrides: { a: 30_000, b: 30_000 } });
    expect(store().people.map((p) => p.name)).toEqual(['Rahul', 'Priya']);
  });

  it('re-committing without changes keeps the same amounts (You absorb the remainder)', () => {
    store().seedExisting({ splitId: 's1', shares });
    store().begin(120_000);
    expect(store().commit()).toBe(true);
    expect(store().committed?.map((c) => c.amountMinor)).toEqual([30_000, 30_000]);
  });

  it('removeSplit marks an existing split for deletion, but a never-saved one is simply dropped', () => {
    store().seedExisting({ splitId: 's1', shares });
    store().removeSplit();
    expect(store().pending()).toEqual({ committed: null, existingSplitId: 's1', removed: true, send: true });
    store().reset();
    store().begin(1000);
    store().togglePerson(person('a'));
    store().commit();
    store().removeSplit();
    expect(store().pending()).toEqual({ committed: null, existingSplitId: null, removed: false, send: true });
  });

  it('seedExisting(null) clears', () => {
    store().seedExisting({ splitId: 's1', shares });
    store().seedExisting(null);
    expect(store().pending()).toEqual({ committed: null, existingSplitId: null, removed: false, send: true });
  });
});

it('reset clears everything', () => {
  store().begin(1000);
  store().togglePerson(person('a'));
  store().commit();
  store().reset();
  expect(store()).toMatchObject({ committed: null, people: [], existingSplitId: null, totalMinor: 0, stage: 'people' });
});
