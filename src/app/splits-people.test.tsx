import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { Person } from '@/db/schema';
import { useToast } from '@/stores/toast';

import SplitsPeopleScreen from './splits-people';

const mockBack = jest.fn();
let mockPeople: Person[] = [];
let mockSettings: Record<string, unknown> = {};
let mockAccess = 'denied';
let mockCanSend = false;
let mockSupported = true;
const mockSetSetting = jest.fn((k: string, v: unknown) => {
  mockSettings[k] = v;
});
const mockRename = jest.fn((_id: string, _name: string) => {});
const mockDelete = jest.fn((_id: string): boolean => true);
const mockRequestAccess = jest.fn(async () => mockAccess);
const mockOpenSettings = jest.fn();

jest.mock('expo-router', () => ({ router: { back: () => mockBack() } }));
jest.mock('@/db/repositories/persons', () => ({
  listPersons: () => mockPeople,
  renamePerson: (id: string, name: string) => mockRename(id, name),
  deletePersonIfUnused: (id: string) => mockDelete(id),
}));
jest.mock('@/db/repositories/settings', () => ({
  getSetting: (k: string, fallback: unknown) => mockSettings[k] ?? fallback,
  setSetting: (k: string, v: unknown) => mockSetSetting(k, v),
}));
jest.mock('@/services/contacts', () => ({
  getContactsAccess: async () => mockAccess,
  requestContactsAccess: () => mockRequestAccess(),
}));
jest.mock('@/services/sms', () => ({
  getSendSmsPermission: async () => ({ granted: mockCanSend }),
  isSmsCaptureSupported: () => mockSupported,
}));

const person = (o: Partial<Person> = {}): Person => ({
  id: 'p-1', displayName: 'Rahul Mehta', phoneKey: '9845897555', phoneDisplay: '+919845897555',
  contactRef: null, source: 'manual', createdAt: 1, updatedAt: 1, ...o,
});

beforeEach(() => {
  mockBack.mockReset();
  mockPeople = [];
  mockSettings = {};
  mockAccess = 'denied';
  mockCanSend = false;
  mockSupported = true;
  mockSetSetting.mockClear();
  mockRename.mockReset();
  mockDelete.mockReset().mockReturnValue(true);
  mockRequestAccess.mockClear();
  mockOpenSettings.mockClear();
  useToast.getState().clear();
  jest.spyOn(Linking, 'openSettings').mockImplementation(async () => mockOpenSettings());
});
afterEach(() => useToast.getState().clear());

describe('Settings › Splits & people (UI-080)', () => {
  it('shows the three sections and an empty people list', async () => {
    const { getByText } = await render(<SplitsPeopleScreen />);
    expect(getByText('Splits & people')).toBeTruthy();
    expect(getByText('YOUR NAME IN REQUESTS')).toBeTruthy();
    expect(getByText('SENDING')).toBeTruthy();
    expect(getByText(/Nobody yet/)).toBeTruthy();
  });

  it('saves the name used in requests, sanitised for the SMS', async () => {
    const { getByPlaceholderText } = await render(<SplitsPeopleScreen />);
    await fireEvent.changeText(getByPlaceholderText('e.g. Karthik (optional)'), 'Karthik');
    expect(mockSetSetting).toHaveBeenCalledWith('splitYourName', 'Karthik');
  });

  it('contacts access: off asks just-in-time, blocked opens system settings', async () => {
    const off = await render(<SplitsPeopleScreen />);
    expect(off.getByText(/tap to allow/)).toBeTruthy();
    await fireEvent.press(off.getByLabelText('Contacts access'));
    expect(mockRequestAccess).toHaveBeenCalledTimes(1);
    await off.unmount();

    mockAccess = 'blocked';
    const blocked = await render(<SplitsPeopleScreen />);
    expect(blocked.getByText(/turn it on in system settings/)).toBeTruthy();
    await fireEvent.press(blocked.getByLabelText('Contacts access'));
    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('says whether sending is allowed yet, and that it uses the default SIM', async () => {
    const notYet = await render(<SplitsPeopleScreen />);
    expect(notYet.getByText(/Asked for the first time/)).toBeTruthy();
    await notYet.unmount();

    mockCanSend = true;
    const allowed = await render(<SplitsPeopleScreen />);
    expect(allowed.getByText(/default SIM/)).toBeTruthy();
    await allowed.unmount();

    mockSupported = false;
    const unsupported = await render(<SplitsPeopleScreen />);
    expect(unsupported.getByText('Not available on this device')).toBeTruthy();
  });

  it('lists saved people with a masked number, renames one, and removes one', async () => {
    mockPeople = [person()];
    const { getByText, getByRole, getByPlaceholderText } = await render(<SplitsPeopleScreen />);
    expect(getByText('Rahul Mehta')).toBeTruthy();
    expect(getByText('98•••• 7555')).toBeTruthy();

    await fireEvent.press(getByRole('button', { name: 'Rename Rahul Mehta' }));
    await fireEvent.changeText(getByPlaceholderText('Name'), 'Rahul M');
    await fireEvent(getByPlaceholderText('Name'), 'submitEditing');
    expect(mockRename).toHaveBeenCalledWith('p-1', 'Rahul M');

    await fireEvent.press(getByRole('button', { name: 'Remove Rahul Mehta' }));
    expect(mockDelete).toHaveBeenCalledWith('p-1');
    expect(useToast.getState().message).toBe('Rahul Mehta removed');
  });

  it('refuses to remove someone who is still in a split, and says why', async () => {
    mockPeople = [person()];
    mockDelete.mockReturnValue(false);
    const { getByRole } = await render(<SplitsPeopleScreen />);
    await fireEvent.press(getByRole('button', { name: 'Remove Rahul Mehta' }));
    expect(useToast.getState().message).toMatch(/part of a split/);
  });

  it('back returns to Settings', async () => {
    const { getByRole } = await render(<SplitsPeopleScreen />);
    await fireEvent.press(getByRole('button', { name: 'Back' }));
    expect(mockBack).toHaveBeenCalled();
  });
});
