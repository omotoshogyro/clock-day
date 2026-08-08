import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { MARKERS, type MarkerId } from "../constants";
import { useTheme } from "../theme";
import { MarkerPen } from "./marker-pen";

type Props = {
  selected: MarkerId;
  onSelect: (id: MarkerId) => void;
  /** Present only while a range is selected — see the note on the divider. */
  onDelete?: () => void;
};

export function MarkerTray({ selected, onSelect, onDelete }: Props) {
  const theme = useTheme();

  return (
    <View style={[styles.tray, { borderTopColor: theme.hairline }]}>
      {MARKERS.map((m) => (
        <MarkerPen
          key={m.id}
          marker={m}
          selected={m.id === selected}
          onPress={() => onSelect(m.id)}
        />
      ))}

      {/* Delete used to be reachable only from inside the name editor, sitting
          a thumb's width from the text field. Here it is one tap from a
          selection and invisible otherwise — but it is destructive, so it gets
          a divider and its own gap rather than sitting flush against a pen. */}
      {onDelete && (
        <>
          <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
          <Pressable
            onPress={onDelete}
            hitSlop={8}
            style={styles.trash}
            accessibilityRole="button"
            accessibilityLabel="Delete range"
          >
            <HugeiconsIcon icon={Delete02Icon} size={22} color={theme.danger} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  divider: { width: StyleSheet.hairlineWidth, height: 34, marginHorizontal: 10 },
  trash: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
