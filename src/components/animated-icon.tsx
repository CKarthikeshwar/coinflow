/**
 * FILE PURPOSE
 * ------------
 * `AnimatedSplashOverlay` — the animated transition from the native splash screen into the
 * real app. It's a full-screen overlay that starts showing the same image the native splash
 * shows (so there's no visible jump when the native splash hands off), then plays a short
 * fade/scale-out animation once the app is actually ready underneath it.
 *
 * WHERE IT FITS
 * -------------
 * Mounted once in `src/app/_layout.tsx`, as a sibling to `<MigrationGate>`'s children (so it
 * sits visually on top of everything else while it's still showing). The handoff sequence:
 *   1. `SplashScreen.preventAutoHideAsync()` runs at module load in `_layout.tsx` — the native
 *      splash stays frozen on screen.
 *   2. This component renders, showing a plain (non-animated) copy of the splash image.
 *   3. Its `onLayout` fires once it's actually painted → calls `SplashScreen.hideAsync()` to
 *      dismiss the native splash — this component's own image is already covering the screen,
 *      so nothing flashes — then flips into its animated exit.
 *   4. The exit `Keyframe` animation plays; when it finishes, this component unmounts itself
 *      (`setVisible(false)`), revealing the real app underneath.
 *
 * IMPORTANT
 * ---------
 * `AnimatedIcon` (further down this file, and its `.web.tsx` counterpart) is a SEPARATE,
 * unused component — a more elaborate glow/logo animation left over from this project's
 * original `create-expo-app` template. Nothing in `src/app/` or `src/features/` imports or
 * renders it; only `AnimatedSplashOverlay` is actually wired into the app. It hasn't been
 * removed as part of this documentation pass (comment-only changes), but it's dead code.
 */

import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;
const DURATION = 600;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  const image = <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />;

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      {image}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}>
      {image}
    </View>
  );
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: INITIAL_SCALE_FACTOR }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

// NOTE: not currently used anywhere — see the file-level comment above. Left over from the
// original create-expo-app template's icon animation demo.
export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View entering={keyframe.duration(DURATION)} style={styles.background} />
      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  image: {
    width: 76,
    height: 71,
  },
  background: {
    borderRadius: 40,
    experimental_backgroundImage: `linear-gradient(180deg, #3C9FFE, #0274DF)`,
    width: 128,
    height: 128,
    position: 'absolute',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
