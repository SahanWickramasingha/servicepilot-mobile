import { Tabs } from "expo-router";
import {
  BriefcaseBusiness,
  Clock3,
  Home,
  UserRound,
} from "lucide-react-native";

export default function TechnicianTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarStyle: {
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 12,
          height: 68,
          borderRadius: 20,

          backgroundColor: "#0B1726",

          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: "#17263A",

          paddingTop: 7,
          paddingBottom: 7,

          elevation: 10,

          shadowColor: "#000000",
          shadowOffset: {
            width: 0,
            height: 8,
          },
          shadowOpacity: 0.25,
          shadowRadius: 16,
        },

        tabBarActiveTintColor: "#22C55E",
        tabBarInactiveTintColor: "#64748B",

        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      {/* Dashboard */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",

          tabBarIcon: ({ color, focused }) => (
            <Home
              size={focused ? 23 : 21}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />

      {/* Jobs */}
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",

          tabBarIcon: ({ color, focused }) => (
            <BriefcaseBusiness
              size={focused ? 23 : 21}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />

      {/* History */}
      <Tabs.Screen
        name="history"
        options={{
          title: "History",

          tabBarIcon: ({ color, focused }) => (
            <Clock3
              size={focused ? 23 : 21}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />

      {/* Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",

          tabBarIcon: ({ color, focused }) => (
            <UserRound
              size={focused ? 23 : 21}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
    </Tabs>
  );
}