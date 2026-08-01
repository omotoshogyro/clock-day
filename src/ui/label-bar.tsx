import {
  ArrowUp01Icon,
  Delete02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { useTheme } from "../theme";

type Props = {
  title: string;
  onChangeTitle: (t: string) => void;
  onDelete: () => void;
  onConfirm: () => void;
  onCollapse: () => void;
  /** Keyboard height in px, written from the UI thread. */
  kbHeight: SharedValue<number>;
  bottomInset: number;
};

/**
 * The commit bar: delete, name, collapse, confirm. It rides the keyboard so
 * the field stays just above it, matching the reference's focused state.
 */
export function LabelBar({
  title,
  onChangeTitle,
  onDelete,
  onConfirm,
  onCollapse,
  kbHeight,
  bottomInset,
}: Props) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Give the slide-in a frame before the keyboard is requested.
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -kbHeight.value }],
  }));

  return (
    <Animated.View
      style={[styles.wrap, { paddingBottom: bottomInset + 10 }, style]}
    >
      <Pressable
        onPress={onDelete}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Delete range"
        style={[
          styles.circle,
          { borderColor: theme.surfaceEdge, backgroundColor: theme.surface },
        ]}
      >
        <HugeiconsIcon
          icon={Delete02Icon}
          size={20}
          color={theme.danger}
          strokeWidth={2}
        />
      </Pressable>

      <View
        style={[
          styles.field,
          { backgroundColor: theme.surface, borderColor: theme.surfaceEdge },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={title}
          onChangeText={onChangeTitle}
          placeholder="Untitled"
          placeholderTextColor={theme.subtle}
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={onConfirm}
          style={[styles.input, { color: theme.ink }]}
          accessibilityLabel="Range name"
        />
      </View>

      <Pressable
        onPress={onCollapse}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss keyboard"
        style={[
          styles.circle,
          { borderColor: theme.surfaceEdge, backgroundColor: theme.surface },
        ]}
      >
        <HugeiconsIcon
          icon={ArrowUp01Icon}
          size={20}
          color={theme.ink}
          strokeWidth={2}
        />
      </Pressable>

      <Pressable
        onPress={onConfirm}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Save range"
        style={[styles.circle, styles.confirm, { backgroundColor: theme.ink }]}
      >
        <HugeiconsIcon
          icon={Tick02Icon}
          size={22}
          color={theme.bg}
          strokeWidth={2.6}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  circle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  confirm: { borderWidth: 0 },
  field: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  input: { fontSize: 16, padding: 0 },
});
