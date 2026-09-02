// CoinFlow is Android-only (D3). `SheetHost` is mounted unconditionally in the root layout, but
// its content (`TransactionSheetBody`, `CategoryPickerSheet`) reads the database — keep it off web.
export function SheetHost() {
  return null;
}
