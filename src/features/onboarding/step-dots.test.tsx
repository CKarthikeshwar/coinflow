import { render } from '@testing-library/react-native';

import { StepDots } from './step-dots';

it('renders one dot per step', async () => {
  const { getAllByTestId } = await render(<StepDots total={3} current={1} />);
  expect(getAllByTestId(/^step-dot-/)).toHaveLength(3);
});

it('reports the current step via accessibilityValue', async () => {
  const { getByTestId } = await render(<StepDots total={3} current={2} />);
  expect(getByTestId('step-dots').props.accessibilityValue).toEqual({ min: 1, max: 3, now: 2 });
});

it('only the current dot gets the active style', async () => {
  const { getByTestId } = await render(<StepDots total={3} current={2} />);
  const flatten = (style: unknown) => (Array.isArray(style) ? Object.assign({}, ...style) : style);

  expect(flatten(getByTestId('step-dot-1').props.style).width).not.toBe(18);
  expect(flatten(getByTestId('step-dot-2').props.style).width).toBe(18);
  expect(flatten(getByTestId('step-dot-3').props.style).width).not.toBe(18);
});
