// CoinFlow is Android-only (D3). `NotificationRouter` is mounted unconditionally in the root
// layout, but reads live notification state and the database — keep it off web.
export function NotificationRouter() {
  return null;
}
