import { router } from "expo-router";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Screen from "@/src/components/layout/Screen";
import Container from "@/src/components/layout/Container";
import Header from "@/src/components/layout/Header";

import AppLogo from "@/src/components/ui/AppLogo";
import AppInput from "@/src/components/ui/AppInput";
import PrimaryButton from "@/src/components/ui/PrimaryButton";

import { Colors } from "@/src/theme/colors";
import { Spacing } from "@/src/theme/spacing";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    // Temporary navigation
    router.replace("/(tabs)");
  };

  // TODO: Implement actual login logic with authentication service
  return (
  <Screen>
    <Container>
      <AppLogo />

      <Header
        title="Welcome Back 👋"
        subtitle="Sign in to continue using ServicePilot"
      />

      <AppInput
        label="Email"
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        icon="mail"
      />

      <AppInput
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        icon="lock-closed-outline"
      />

      <TouchableOpacity
        onPress={() => router.push("/forgot-password")}
      >
        <Text style={styles.forgot}>Forgot Password?</Text>
      </TouchableOpacity>

      <PrimaryButton
        title="Sign In"
        onPress={handleLogin}
      />

      <View style={styles.bottom}>
        <Text style={styles.bottomText}>
        {"Don't have an account?"}
        </Text>

        <TouchableOpacity
          onPress={() => router.push("/register")}
        >
          <Text style={styles.register}>
            Create Account
          </Text>
        </TouchableOpacity>
      </View>
    </Container>
  </Screen>
);
}

const styles = StyleSheet.create({
  forgot: {
    textAlign: "right",
    color: Colors.primary,
    marginBottom: Spacing.xl,
    fontWeight: "600",
  },

  bottom: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.xxxl,
  },

  bottomText: {
    color: Colors.textSecondary,
  },

  register: {
    marginLeft: Spacing.xs,
    color: Colors.primary,
    fontWeight: "700",
  },
});

