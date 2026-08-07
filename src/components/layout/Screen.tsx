import React, { ReactNode } from "react";
import {
  SafeAreaView,
  StyleSheet,
  View,
} from "react-native";

import { Colors } from "@/src/theme/colors";

interface ScreenProps {
  children: ReactNode;
  backgroundColor?: string;
}

// A reusable screen component that provides a safe area and background color
export default function Screen({
  children,
  backgroundColor = Colors.background,
}: ScreenProps) {
  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor,
        },
      ]}
    >

      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
}
// Styles for the Screen component
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  container: {
    flex: 1,
  },
});