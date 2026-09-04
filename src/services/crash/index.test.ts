/**
 * §33.4 (D34) — the two things that matter here: (a) `Sentry.init()` is the *only* thing that
 * can open a socket, and it only runs when told to arm; (b) `beforeSend`/`beforeBreadcrumb`
 * actually scrub, and fail closed rather than leak a partially-scrubbed event.
 */

const mockInit = jest.fn();
const mockClose = jest.fn();
const mockCaptureException = jest.fn();
const mockSetCrashSink = jest.fn();
// Identity on purpose: `beforeSend`'s LEAK_PATTERN check is the fail-closed *net*, independent
// of `scrubText`'s own scrubbing — this mock lets a raw leak reach it so the net itself is what
// gets tested, not `scrubText` (which has its own dedicated tests in `src/lib/log.test.ts`).
const mockScrubText = jest.fn((s: string) => s);

jest.mock('@sentry/react-native', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  close: (...args: unknown[]) => mockClose(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { sentryDsn: 'https://test@example.ingest.sentry.io/1' } } },
}));
jest.mock('@/lib/log', () => ({
  _setCrashSink: (...args: unknown[]) => mockSetCrashSink(...args),
  redactError: (e: unknown) => ({ name: 'Error', message: 'scrubbed', stack: undefined }),
  scrubText: (s: string) => mockScrubText(s),
}));

function freshModule() {
  jest.resetModules();
  // Module-local `armed` state (the guard against a double `Sentry.init()`) needs a fresh
  // module instance per test.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./index') as typeof import('./index');
}

beforeEach(() => {
  mockInit.mockReset();
  mockClose.mockReset();
  mockCaptureException.mockReset();
  mockSetCrashSink.mockReset();
  mockScrubText.mockReset().mockImplementation((s: string) => s);
});

describe('armCrashReporting', () => {
  it('does nothing on arm(false) when never armed — no init, no close, no socket', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(false);
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with the DSN and the D34-mandated no-tracing / no-PII config on arm(true)', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    expect(mockInit).toHaveBeenCalledTimes(1);
    const config = mockInit.mock.calls[0][0];
    expect(config.dsn).toBe('https://test@example.ingest.sentry.io/1');
    expect(config.tracesSampleRate).toBe(0);
    expect(config.enableAutoSessionTracking).toBe(false);
    expect(config.sendDefaultPii).toBe(false);
    expect(config.debug).toBe(false);
    expect(mockSetCrashSink).toHaveBeenCalledWith(expect.any(Function), true);
  });

  it('calls Sentry.close() on a later arm(false)', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    armCrashReporting(false);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockSetCrashSink).toHaveBeenLastCalledWith(expect.any(Function), false);
  });

  it('is a no-op when called again with the same value (no double init)', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    armCrashReporting(true);
    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});

describe('captureBoundaryError (RootErrorBoundary, §32.3)', () => {
  it('returns null and never calls Sentry when reporting is off', () => {
    const { captureBoundaryError } = freshModule();
    expect(captureBoundaryError(new Error('boom'))).toBeNull();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('sends a redacted error tagged op:boundary and returns the real Sentry event id once armed', () => {
    const { armCrashReporting, captureBoundaryError } = freshModule();
    armCrashReporting(true);
    mockCaptureException.mockReturnValue('event-abc123');

    const eventId = captureBoundaryError(new Error('raw, unscrubbed message'));

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [sentError, hint] = mockCaptureException.mock.calls[0];
    expect(sentError.message).toBe('scrubbed'); // from the mocked redactError
    expect(hint).toEqual({ tags: { op: 'boundary' } });
    expect(eventId).toBe('event-abc123');
  });

  it('never reports the same crash twice — a boundary catch is one `captureException` call, not shared with the generic log sink', () => {
    const { armCrashReporting, captureBoundaryError } = freshModule();
    armCrashReporting(true);
    captureBoundaryError(new Error('boom'));
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('returns null when Sentry hands back an empty event id', () => {
    const { armCrashReporting, captureBoundaryError } = freshModule();
    armCrashReporting(true);
    mockCaptureException.mockReturnValue('');
    expect(captureBoundaryError(new Error('boom'))).toBeNull();
  });
});

describe('beforeSend — scrub + fail-closed', () => {
  it('strips device/user/request context', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    const beforeSend = mockInit.mock.calls[0][0].beforeSend;
    const event = {
      contexts: { device: { name: 'Pixel 8' } },
      user: { id: 'abc' },
      request: { url: 'x' },
      server_name: 'host',
      exception: { values: [{ value: 'ParseError: bad token' }] },
    };
    const out = beforeSend(event);
    expect(out.contexts.device.name).toBeUndefined();
    expect(out.user).toBeUndefined();
    expect(out.request).toBeUndefined();
    expect(out.server_name).toBeUndefined();
  });

  it('drops the event entirely if a currency/VPA/digit pattern survives scrubbing (fail closed)', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    const beforeSend = mockInit.mock.calls[0][0].beforeSend;
    // `scrubText` is mocked to identity in this file — simulates a value scrubbing failed to
    // catch. LEAK_PATTERN (real, defined in the module under test) is the independent net that
    // must catch it anyway.
    const event = { exception: { values: [{ value: 'account 918273645 overdrawn' }] } };
    expect(beforeSend(event)).toBeNull();
  });

  it('calls scrubText on every exception value before the leak check', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    const beforeSend = mockInit.mock.calls[0][0].beforeSend;
    const event = { exception: { values: [{ value: 'TypeError: undefined is not a function' }] } };
    beforeSend(event);
    expect(mockScrubText).toHaveBeenCalledWith('TypeError: undefined is not a function');
  });

  it('passes through a clean, scrubbed event', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    const beforeSend = mockInit.mock.calls[0][0].beforeSend;
    const event = { exception: { values: [{ value: 'TypeError: undefined is not a function' }] } };
    expect(beforeSend(event)).toBe(event);
  });
});

describe('beforeBreadcrumb — drop console/xhr/fetch and financial-route navigation', () => {
  it('drops console breadcrumbs', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    const beforeBreadcrumb = mockInit.mock.calls[0][0].beforeBreadcrumb;
    expect(beforeBreadcrumb({ category: 'console' })).toBeNull();
  });

  it('drops fetch/xhr breadcrumbs', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    const beforeBreadcrumb = mockInit.mock.calls[0][0].beforeBreadcrumb;
    expect(beforeBreadcrumb({ category: 'fetch' })).toBeNull();
    expect(beforeBreadcrumb({ category: 'xhr' })).toBeNull();
  });

  it('drops navigation breadcrumbs into a financial route', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    const beforeBreadcrumb = mockInit.mock.calls[0][0].beforeBreadcrumb;
    expect(beforeBreadcrumb({ category: 'navigation', data: { to: 'transaction/abc123' } })).toBeNull();
    expect(beforeBreadcrumb({ category: 'navigation', data: { to: 'analytics' } })).toBeNull();
  });

  it('keeps navigation breadcrumbs into a non-financial route', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    const beforeBreadcrumb = mockInit.mock.calls[0][0].beforeBreadcrumb;
    const crumb = { category: 'navigation', data: { to: 'settings' } };
    expect(beforeBreadcrumb(crumb)).toBe(crumb);
  });

  it('keeps app.lifecycle and error breadcrumbs', () => {
    const { armCrashReporting } = freshModule();
    armCrashReporting(true);
    const beforeBreadcrumb = mockInit.mock.calls[0][0].beforeBreadcrumb;
    const lifecycle = { category: 'app.lifecycle' };
    const error = { category: 'error' };
    expect(beforeBreadcrumb(lifecycle)).toBe(lifecycle);
    expect(beforeBreadcrumb(error)).toBe(error);
  });
});
