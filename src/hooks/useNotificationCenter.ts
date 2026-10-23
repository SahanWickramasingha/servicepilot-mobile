import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/src/firebase/config";
import { subscribeToUserProfile, type UserRole } from "@/src/services/user.service";
import { loadNotificationHistory, markAllNotificationsRead, refreshNotificationUnreadTotal, retryNotificationCenter, subscribeToNotificationCenter, type NotificationCenterItem, type NotificationCenterStatus } from "@/src/services/notification.service";

/** Profile and notification subscriptions belong to the same mounted Auth session. */
export function useNotificationCenter(requiredRole: UserRole) {
  const retry = useCallback(() => { const uid = auth.currentUser?.uid; if (uid) retryNotificationCenter(uid, requiredRole); }, [requiredRole]);
  useFocusEffect(useCallback(() => {
    const refresh = () => { const uid = auth.currentUser?.uid; if (uid) retryNotificationCenter(uid, requiredRole, true); };
    refresh(); let previous = AppState.currentState;
    const listener = AppState.addEventListener('change', (next) => { if (next === 'active' && previous !== 'active') refresh(); previous = next; });
    return () => listener.remove();
  }, [requiredRole]));
  const [state, setState] = useState<{ viewer: string | null; items: NotificationCenterItem[]; loading: boolean; errorMessage: string; status?: NotificationCenterStatus }>({
    viewer: null, items: [], loading: true, errorMessage: "",
  });
  useEffect(() => {
    let active = true, generation = 0, centerGeneration = 0;
    let stopProfile: (() => void) | undefined, stopCenter: (() => void) | undefined;
    const closeCenter = () => { centerGeneration++; stopCenter?.(); stopCenter = undefined; };
    const stopAuth = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      const version = ++generation;
      stopProfile?.(); closeCenter();
      const viewer = user?.uid ?? null;
      const current = () => active && version === generation && auth.currentUser === user;
      setState({ viewer, items: [], loading: !!user, errorMessage: user ? "" : "Please sign in again." });
      if (!user) return;
      stopProfile = subscribeToUserProfile(user.uid, (profile) => {
        if (!current()) return;
        if (!profile || profile.role !== requiredRole || (profile.accountStatus && profile.accountStatus !== "active") || profile.lifecyclePending === true) {
          closeCenter();
          setState({ viewer, items: [], loading: false, errorMessage: "Profile not found for this account." });
          return;
        }
        if (stopCenter) return; // Availability/name changes do not restart four queries.
        setState({ viewer, items: [], loading: true, errorMessage: "" });
        const centerVersion = centerGeneration;
        const centerCurrent = () => current() && centerVersion === centerGeneration;
        stopCenter = subscribeToNotificationCenter({ userId: user.uid, role: requiredRole }, (items, status) => {
          if (centerCurrent()) setState((previous) => ({ ...previous, viewer, items, loading: status?.loading ?? false,
            status, errorMessage: status?.operationError || (status?.errors.length ? "Some notifications are unavailable. Check your connection and retry." : "") }));
        }, (_error, context) => {
          if (centerCurrent()) setState((previous) => ({ ...previous, loading: false, errorMessage:
            context.queryType === "system-messages" ? "Unable to load system messages."
              : context.queryType === "personal-notifications" ? "Unable to load personal notifications."
                : "Unable to load message read status." }));
        });
      }, () => {
        if (!current()) return;
        closeCenter();
        setState({ viewer, items: [], loading: false, errorMessage: "Unable to load notifications. Check your connection." });
      });
    });
    return () => { active = false; generation++; stopProfile?.(); closeCenter(); stopAuth(); };
  }, [requiredRole]);
  return { ...(state.viewer === (auth.currentUser?.uid ?? null) ? state
    : { viewer: null, items: [], loading: true, errorMessage: "" }), retry,
    loadMore: () => loadNotificationHistory(auth.currentUser?.uid ?? "", requiredRole),
    refreshTotal: () => refreshNotificationUnreadTotal(auth.currentUser?.uid ?? "", requiredRole),
    markAll: () => markAllNotificationsRead(auth.currentUser?.uid ?? "", requiredRole) };
}
