import React, { ReactNode } from "react";
import { View, StyleSheet } from "react-native";

import { Spacing } from "@/src/theme/spacing";

interface ContainerProps {
  children: ReactNode;
}

export default function Container({ children }: ContainerProps) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
});