import { fireEvent, render } from '@testing-library/react-native';

import { ConfirmDialog } from './confirm-dialog';

const baseProps = {
  visible: true,
  glyph: 'trash-2' as const,
  title: 'Delete this?',
  body: 'This cannot be undone.',
  confirmLabel: 'Delete',
};

it('a plain dialog calls onConfirm immediately on press', async () => {
  const onConfirm = jest.fn();
  const { getByText } = await render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={jest.fn()} />);
  await fireEvent.press(getByText('Delete'));
  expect(onConfirm).toHaveBeenCalled();
});

describe('twoStep', () => {
  it('starts with the confirm button disabled', async () => {
    const { getByRole } = await render(
      <ConfirmDialog {...baseProps} twoStep onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByRole('button', { name: 'Delete' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('pressing confirm while disabled does not call onConfirm', async () => {
    const onConfirm = jest.fn();
    const { getByText } = await render(
      <ConfirmDialog {...baseProps} twoStep onConfirm={onConfirm} onCancel={jest.fn()} />,
    );
    await fireEvent.press(getByText('Delete'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('typing the exact phrase enables confirm, and pressing it calls onConfirm', async () => {
    const onConfirm = jest.fn();
    const { getByPlaceholderText, getByText } = await render(
      <ConfirmDialog {...baseProps} twoStep onConfirm={onConfirm} onCancel={jest.fn()} />,
    );
    await fireEvent.changeText(getByPlaceholderText('CONFIRM'), 'CONFIRM');
    await fireEvent.press(getByText('Delete'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('a near-miss ("confirm" lowercase) keeps confirm disabled', async () => {
    const onConfirm = jest.fn();
    const { getByPlaceholderText, getByText } = await render(
      <ConfirmDialog {...baseProps} twoStep onConfirm={onConfirm} onCancel={jest.fn()} />,
    );
    await fireEvent.changeText(getByPlaceholderText('CONFIRM'), 'confirm');
    await fireEvent.press(getByText('Delete'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the typed field resets after Cancel, so the next open starts blank', async () => {
    const { getByPlaceholderText, getByText, rerender } = await render(
      <ConfirmDialog {...baseProps} visible={true} twoStep onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    await fireEvent.changeText(getByPlaceholderText('CONFIRM'), 'CONFIRM');
    await fireEvent.press(getByText('Cancel'));
    // The real caller flips `visible` back to false only in response to `onCancel` firing (as it
    // just did) — simulate that same round trip rather than driving `visible` independently.
    await rerender(<ConfirmDialog {...baseProps} visible={false} twoStep onConfirm={jest.fn()} onCancel={jest.fn()} />);
    await rerender(<ConfirmDialog {...baseProps} visible={true} twoStep onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(getByPlaceholderText('CONFIRM').props.value).toBe('');
  });
});
