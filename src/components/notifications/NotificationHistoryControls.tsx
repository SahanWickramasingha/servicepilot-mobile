import { Text, TouchableOpacity, View } from "react-native";
import type { NotificationCenterStatus } from "@/src/services/notification.service";

export function NotificationHistoryControls({ status, loadMore, refreshTotal, markAll, refreshRecent, onError }: {
  status?: NotificationCenterStatus; loadMore: () => Promise<void>; refreshTotal: () => Promise<void>;
  markAll: () => Promise<void>; onError: (message: string) => void;
  refreshRecent: () => void;
}) {
  const action = (run: () => Promise<void>) => { void run().catch(() => onError("Unable to finish. Check your connection and retry.")); };
  return <View style={{ gap: 8, padding: 16 }}>
    <Text style={{ color: "#CBD5E1" }}>{status?.unreadTotal === undefined ? "Unread total not checked" : `${status.unreadTotal} unread at last check`}</Text>
    <Text style={{ color: "#94A3B8" }}>Newest first. Check total scans all eligible history in pages. Mark all read includes unloaded history; new arrivals may remain unread.</Text>
    {status?.windowChanged && <><Text style={{ color: "#CBD5E1" }}>New activity moved the history window. Refresh recent notifications, then load earlier history to see the full sequence.</Text><TouchableOpacity accessibilityRole="button" onPress={refreshRecent} style={{ minHeight: 44 }}><Text style={{ color: "#60A5FA" }}>Refresh recent notifications</Text></TouchableOpacity></>}
    <TouchableOpacity accessibilityRole="button" disabled={status?.totalBusy || status?.markAllBusy} onPress={() => action(refreshTotal)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#60A5FA" }}>{status?.totalBusy ? "Checking unread total…" : "Check unread total"}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={status?.markAllBusy || status?.totalBusy} onPress={() => action(markAll)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#60A5FA" }}>{status?.markAllBusy ? "Marking all history read…" : "Mark all read"}</Text></TouchableOpacity>
    {status?.hasMore && !status.windowChanged && <TouchableOpacity accessibilityRole="button" disabled={status.historyLoading} onPress={() => action(loadMore)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#60A5FA" }}>{status.historyLoading ? "Loading history…" : "Load earlier notifications"}</Text></TouchableOpacity>}
  </View>;
}
