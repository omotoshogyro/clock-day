import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { QUICK, SNAPPY, type Marker } from "../constants";

const W = 30;
const NIB_H = 17;
const COLLAR_H = 5;
const BODY_H = 42;
const CAP_H = NIB_H + COLLAR_H + 8;

type Props = {
  marker: Marker;
  selected: boolean;
  onPress: () => void;
};

/**
 * A highlighter drawn from primitives — chisel nib, collar, gradient barrel,
 * gloss stripe, and a cap that slides off when the pen is picked. Uncapping is
 * how the reference signals which colour is active.
 */
export function MarkerPen({ marker, selected, onPress }: Props) {
  // No reduced-motion branch here: withSpring/withTiming default to
  // ReduceMotion.System, so they already snap to the end value when the system
  // setting is on.
  const penStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(selected ? -14 : 0, SNAPPY) }],
  }));

  const capStyle = useAnimatedStyle(() => ({
    opacity: withTiming(selected ? 0 : 1, QUICK),
    transform: [{ translateY: withSpring(selected ? -22 : 0, SNAPPY) }],
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${marker.id} highlighter`}
      style={styles.hit}
    >
      <Animated.View style={[styles.pen, penStyle]}>
        {/* Chisel nib: narrow at the tip, flaring into the collar. */}
        <Svg width={W} height={NIB_H}>
          <Path
            d={`M ${W * 0.34} 1 L ${W * 0.66} 1 L ${W * 0.82} ${NIB_H} L ${
              W * 0.18
            } ${NIB_H} Z`}
            fill={marker.fill}
          />
          <Path
            d={`M ${W * 0.34} 1 L ${W * 0.5} 1 L ${W * 0.5} ${NIB_H} L ${
              W * 0.18
            } ${NIB_H} Z`}
            fill="rgba(255,255,255,0.35)"
          />
        </Svg>

        <View style={[styles.collar, { backgroundColor: marker.edge }]} />

        <View style={styles.body}>
          <LinearGradient
            colors={marker.body}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          {marker.body2 && (
            <LinearGradient
              colors={marker.body2}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.rainbow]}
            />
          )}
          <View style={styles.gloss} />
          <View style={styles.shade} />
        </View>

        <Animated.View style={[styles.cap, capStyle]}>
          <LinearGradient
            colors={marker.body}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.capGloss} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: W + 14,
    height: NIB_H + COLLAR_H + BODY_H + 16,
    justifyContent: "flex-end",
  },
  pen: { width: W, alignSelf: "center", alignItems: "center" },
  collar: { width: W * 0.72, height: COLLAR_H, borderRadius: 1.5 },
  body: {
    width: W,
    height: BODY_H,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: "hidden",
  },
  rainbow: { opacity: 0.55 },
  gloss: {
    position: "absolute",
    left: 4.5,
    top: 5,
    bottom: 5,
    width: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  shade: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  cap: {
    position: "absolute",
    top: -3,
    width: W + 3,
    height: CAP_H,
    borderRadius: 6,
    overflow: "hidden",
  },
  capGloss: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 6,
  },
});
