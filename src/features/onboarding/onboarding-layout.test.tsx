import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { OnboardingLayout } from './onboarding-layout';

it('shows children and the footer', async () => {
  const { getByText } = await render(
    <OnboardingLayout step={1} footer={<Text>Footer content</Text>}>
      <Text>Body content</Text>
    </OnboardingLayout>,
  );
  expect(getByText('Body content')).toBeTruthy();
  expect(getByText('Footer content')).toBeTruthy();
});

it('has no back affordance when onBack is omitted (step 1)', async () => {
  const { queryByLabelText } = await render(
    <OnboardingLayout step={1} footer={<Text>Footer</Text>}>
      <Text>Body</Text>
    </OnboardingLayout>,
  );
  expect(queryByLabelText('Back')).toBeNull();
});

it('shows a back button that calls onBack when provided', async () => {
  const onBack = jest.fn();
  const { getByLabelText } = await render(
    <OnboardingLayout step={2} onBack={onBack} footer={<Text>Footer</Text>}>
      <Text>Body</Text>
    </OnboardingLayout>,
  );
  await fireEvent.press(getByLabelText('Back'));
  expect(onBack).toHaveBeenCalled();
});

it('shows the step dots at the given step', async () => {
  const { getByTestId } = await render(
    <OnboardingLayout step={3} footer={<Text>Footer</Text>}>
      <Text>Body</Text>
    </OnboardingLayout>,
  );
  expect(getByTestId('step-dots').props.accessibilityValue).toEqual({ min: 1, max: 3, now: 3 });
});
