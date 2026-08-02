import { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <AppLogo />

        <Text style={styles.title}>Welcome Back 👋</Text>

        <Text style={styles.subtitle}>
          Sign in to continue using ServicePilot
        </Text>

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

        <TouchableOpacity onPress={() => router.push("/forgot-password")}>
          <Text style={styles.forgot}>Forgot Password?</Text>
        </TouchableOpacity>

        <PrimaryButton title="Sign In" onPress={handleLogin} />

        <View style={styles.bottom}>
          <Text style={styles.bottomText}>Don't have an account?</Text>

          <TouchableOpacity onPress={() => router.push("/register")}>
            <Text style={styles.register}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.lg,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 8,
  },

  subtitle: {
    color: Colors.textSecondary,
    marginBottom: 30,
    fontSize: 16,
  },

  forgot: {
    textAlign: "right",
    color: Colors.primary,
    marginBottom: 24,
    fontWeight: "600",
  },

  bottom: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 30,
  },

  bottomText: {
    color: Colors.textSecondary,
  },

  register: {
    marginLeft: 6,
    color: Colors.primary,
    fontWeight: "700",
  },
});
