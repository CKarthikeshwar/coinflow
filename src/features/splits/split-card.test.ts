import { requestLine } from './split-card';

describe('requestLine (CR-31)', () => {
  it('a name-only person reads "Tracking only", not "Not sent"', () => {
    expect(requestLine({ requestState: 'not_sent', person: { phoneDisplay: null } })).toBe('Tracking only');
  });

  it('someone with a number who was not texted (Just track) still reads "Not sent" — a request can be sent later', () => {
    expect(requestLine({ requestState: 'not_sent', person: { phoneDisplay: '+919845897555' } })).toBe('Not sent');
  });

  it('sent / failed states are unchanged', () => {
    expect(requestLine({ requestState: 'sent', person: { phoneDisplay: '+919845897555' } })).toBe('Requested by SMS');
    expect(requestLine({ requestState: 'failed', person: { phoneDisplay: '+919845897555' } })).toBe('Sending failed');
  });
});
