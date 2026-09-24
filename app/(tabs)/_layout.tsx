import { Tabs } from "expo-router";
import {
  CalendarDays,
  Clock3,
  Home,
  UserRound,
} from "lucide-react-native";
import { ProtectedRoute } from "@/src/components/auth/ProtectedRoute";

export default function TabLayout() {
  return (
    <ProtectedRoute allowedRoles={["customer"]}>
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

          tabBarActiveTintColor: "#3B82F6",
          tabBarInactiveTintColor: "#64748B",

          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "600",
            marginTop: 2,
          },

          tabBarItemStyle: {
            borderRadius: 15,
            marginHorizontal: 4,
          },
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Home
              size={focused ? 23 : 21}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color, focused }) => (
            <CalendarDays
              size={focused ? 23 : 21}
              color={color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />

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

      {/* Hidden screens */}
      <Tabs.Screen
        name="create-request"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="select-service"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="request-details"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="live-tracking"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
  name="review-technician"
  options={{
    href: null,
  }}
/>
      </Tabs>
    </ProtectedRoute>
  );
}
