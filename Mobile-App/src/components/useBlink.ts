import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/** 0..1 value that pulses while `active` (used for blinking alert backgrounds). */
export function useBlink(active: boolean, period = 800) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: period, useNativeDriver: false }),
        Animated.timing(v, { toValue: 0, duration: period, useNativeDriver: false })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, period, v]);
  return v;
}
