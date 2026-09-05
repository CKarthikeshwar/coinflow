/**
 * FILE PURPOSE
 * ------------
 * The app's last line of defense against a crash: catches any uncaught error thrown while
 * rendering anywhere below it, and shows `RecoveryScreen` (a friendly "your data is safe,
 * restart" screen) instead of the app going blank or frozen.
 *
 * WHERE IT FITS
 * -------------
 * Mounted in `src/app/_layout.tsx` just inside the providers, above `MigrationGate`/the
 * navigator, so it can catch a crash from anywhere in the tree, `MigrationGate` included. If
 * crash reporting is on, the caught error is also sent to Sentry via `captureBoundaryError`
 * (`src/services/crash/index.ts`), and the returned event id is shown to the user as a
 * reference they could mention if they report the bug.
 *
 * A class component because React has no hook equivalent for `componentDidCatch` /
 * `getDerivedStateFromError` (still true as of React 19).
 *
 * `reloadAppAsync()` (from `expo`, not `expo-updates`) — same choice already made and tested in
 * `migration-gate.tsx`'s "Try again": `expo-updates`' `reloadAsync()` rejects
 * (`ERR_UPDATES_DISABLED`) on this app, which has no OTA channel (D20, direct-install APK).
 */

import { reloadAppAsync } from 'expo';
import { Component, type ReactNode } from 'react';

import { redactError } from '@/lib/log';
import { captureBoundaryError } from '@/services/crash';

import { RecoveryScreen } from './recovery-screen';

type Props = { children: ReactNode };
type State = { error: Error | null; eventId: string | null };

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null, eventId: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.setState({ eventId: captureBoundaryError(error) });
  }

  handleReload = () => {
    reloadAppAsync('Root error boundary — user tapped Reload app');
  };

  render() {
    const { error, eventId } = this.state;
    if (error) {
      return <RecoveryScreen name={redactError(error).name} eventId={eventId} onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}
