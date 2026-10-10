import React, { useEffect, useRef } from "react";
import { Animated, Platform } from "react-native";
import { useReducedMotion } from "./motion";

interface PulseDotProps {
  color: string;
  size?: number;
  /** Stops the loop and rests at full opacity. */
  active?: boolean;
}

/**
 * A dot that breathes while work is in flight.
 *
 * This is the only motion on the surface, and it is deliberate: a static dot
 * cannot distinguish "running" from "stopped mid-run", which is the one thing
 * a reader needs from a live indicator. Opacity is used rather than scale or
 * position so the dot never shifts the layout around it.
 */
export function PulseDot({ color, size = 6, active = true }: PulseDotProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const still = useReducedMotion();

  useEffect(() => {
    if (!active || still) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 700,
          // React Native Web has no native driver; opacity is cheap enough
          // to animate on the JS thread there.
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [active, opacity, still]);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}
