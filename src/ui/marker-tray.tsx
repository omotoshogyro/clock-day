import { StyleSheet, View } from "react-native";

import { MARKERS, type MarkerId } from "../constants";
import { useTheme } from "../theme";
import { MarkerPen } from "./marker-pen";

type Props = {
  selected: MarkerId;
  onSelect: (id: MarkerId) => void;
};

export function MarkerTray({ selected, onSelect }: Props) {
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
});
