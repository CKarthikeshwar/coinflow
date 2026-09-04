import { _setCrashSink, log, redactError, scrubText } from './log';

// `__DEV__` is typed as a global constant; these tests need to flip it to exercise the
// release-only forwarding path.
function setDev(value: boolean) {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
}

describe('scrubText (§32.1 — the privacy boundary)', () => {
  it('strips a currency amount', () => {
    expect(scrubText('paid ₹1,250 for lunch')).toBe('paid […] for lunch');
  });

  it('strips a bare 4-12 digit run (account/reference numbers)', () => {
    expect(scrubText('ref 918273645')).toBe('ref […]');
  });

  it('strips a VPA', () => {
    expect(scrubText('sent to karthik@okhdfc')).toBe('sent to […]');
  });

  it('collapses any string literal longer than 40 chars', () => {
    const long = 'x'.repeat(50);
    expect(scrubText(long)).toBe(`${'x'.repeat(40)}[…]`);
  });

  it('leaves short, pattern-free text untouched', () => {
    expect(scrubText('SMS_INGEST_TASK failed')).toBe('SMS_INGEST_TASK failed');
  });
});

describe('redactError', () => {
  it('keeps only name/message/stack, scrubbed', () => {
    const e = new Error('failed for ₹500');
    e.name = 'ParseError';
    const redacted = redactError(e);
    expect(redacted.name).toBe('ParseError');
    expect(redacted.message).toBe('failed for […]');
  });

  it('wraps a non-Error thrown value', () => {
    const redacted = redactError('a bare string throw');
    expect(redacted.name).toBe('Error');
    expect(redacted.message).toBe('a bare string throw');
  });
});

describe('log.warn/log.error — forwards to the crash sink only when armed and not __DEV__', () => {
  const realDev = __DEV__;
  const capture = jest.fn();

  beforeEach(() => {
    capture.mockReset();
    _setCrashSink(capture, false);
  });

  afterEach(() => {
    setDev(realDev);
    _setCrashSink(null, false);
  });

  it('never forwards while __DEV__ is true, armed or not', () => {
    setDev(true);
    _setCrashSink(capture, true);
    log.error(new Error('boom'), 'op');
    expect(capture).not.toHaveBeenCalled();
  });

  it('does not forward in release when disarmed', () => {
    setDev(false);
    _setCrashSink(capture, false);
    log.error(new Error('boom'), 'op');
    expect(capture).not.toHaveBeenCalled();
  });

  it('forwards in release once armed', () => {
    setDev(false);
    _setCrashSink(capture, true);
    const err = new Error('boom');
    log.warn(err, 'some/op');
    expect(capture).toHaveBeenCalledWith(err, { op: 'some/op' });
  });
});
