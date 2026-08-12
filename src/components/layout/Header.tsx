import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/src/theme/colors";
import { Typography } from "@/src/theme/typography";
import { Spacing } from "@/src/theme/spacing";
// Component for displaying a header with optional back button, title, subtitle, and right component
interface HeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightComponent?: React.ReactNode;
}

export default function Header({
  title,
  subtitle,
  showBackButton = false,
  onBackPress,
  rightComponent,
}: HeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {showBackButton && (
          <Pressable onPress={onBackPress} style={styles.backButton}>
            <Ionicons
              name="chevron-back"
              size={24}
              color={Colors.textPrimary}
            />
          </Pressable>
        )}

        <View>
          <Text style={styles.title}>{title}</Text>

          {subtitle && (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>
      </View>

      {rightComponent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  left: {
    flexDirection: "row",
    alignItems: "center",
  },

  backButton: {
    marginRight: Spacing.md,
  },

  title: {
    color: Colors.textPrimary,
    fontSize: Typography.h2,
    fontWeight: "700",
  },

  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.body,
    marginTop: 4,
  },
});