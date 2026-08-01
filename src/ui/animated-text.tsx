import { TextInput, type StyleProp, type TextStyle } from "react-native";
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from "react-native-reanimated";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Text driven straight from a shared value. The live "5am – 6:15am" readout
 * changes every frame of a drag, so routing it through React state would mean
 * a re-render per frame; a non-editable TextInput lets the UI thread write the
 * string directly.
 */
export function AnimatedText({
  value,
  style,
}: {
  value: SharedValue<string>;
  style?: StyleProp<TextStyle>;
}) {
  // `text` is not a public TextInput prop, but the native view honours it —
  // this is the long-standing way to drive text from the UI thread.
  const animatedProps = useAnimatedProps(() => ({ text: value.value })) as never;

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={value.value}
      animatedProps={animatedProps}
      style={style}
    />
  );
}
