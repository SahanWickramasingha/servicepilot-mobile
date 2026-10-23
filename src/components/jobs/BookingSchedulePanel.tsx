import { useEffect, useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { auth } from "@/src/firebase/config";
import { callBookingSchedule } from "@/src/services/bookingSchedule.service";
import type { ServiceRequest } from "@/src/services/request.service";

export function BookingSchedulePanel({ request, technician = false }: { request: ServiceRequest; technician?: boolean }) {
  const [date, setDate] = useState(""), [time, setTime] = useState(""), [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const generation = useRef(0), viewer = auth.currentUser?.uid;
  useEffect(() => {
    const version = ++generation.current; setDate(""); setTime(""); setDuration(""); setMessage(""); setBusy(false);
    return () => { generation.current = version + 1; };
  }, [request.id, viewer]);
  const legacy = request.schedulingVersion !== 1;
  const editable = ["requested", "pending", "accepted", "assigned"].includes(request.status);
  const run = async (action: "propose" | "approve" | "review-legacy") => {
    if (busy) return;
    const version = generation.current, uid = viewer; setBusy(true); setMessage("");
    try {
      await callBookingSchedule({ action, requestId: request.id, ...(action === "approve" ? { proposalRevision: request.scheduleProposal?.revision } : { date, time, durationMinutes: Number(duration) }) });
      if (version === generation.current && uid === auth.currentUser?.uid) setMessage("Schedule saved. A proposal replaces an accepted reservation only after technician approval.");
    } catch (cause) { if (version === generation.current && uid === auth.currentUser?.uid) setMessage(cause instanceof Error ? cause.message : "Schedule not confirmed. Retry online."); }
    finally { if (version === generation.current) setBusy(false); }
  };
  return <View style={{ padding: 16, gap: 8, backgroundColor: "#101F30", borderRadius: 12, marginVertical: 12 }}>
    <Text style={{ color: "white", fontWeight: "700" }}>Service schedule • Asia/Colombo</Text>
    <Text style={{ color: "#CBD5E1" }}>{legacy ? "Legacy schedule needs explicit review before new acceptance." : `${request.preferredDate} ${request.preferredTime} • ${request.durationMinutes} minutes`}</Text>
    {request.scheduleProposal && <><Text style={{ color: "#CBD5E1" }}>Proposed: {request.scheduleProposal.date} {request.scheduleProposal.time} • {request.scheduleProposal.durationMinutes} minutes</Text>
      {technician && editable && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void run("approve")} style={{ minHeight: 44 }}><Text style={{ color: "#60A5FA" }}>Approve proposed schedule</Text></TouchableOpacity>}</>}
    {((!technician && editable) || (technician && legacy && (editable || request.status === "in_progress"))) && <>
      <Text style={{ color: "#94A3B8" }}>{technician ? "Review the explicit interval with the customer. No legacy history is inferred." : "Propose a change for technician approval. Adjacent bookings are allowed; no travel buffer is included."}</Text>
      <TextInput accessibilityLabel="Schedule date YYYY-MM-DD" value={date} onChangeText={setDate} placeholder="Date YYYY-MM-DD" placeholderTextColor="#94A3B8" editable={!busy} style={{ color: "white", minHeight: 44 }} />
      <TextInput accessibilityLabel="Colombo schedule time" value={time} onChangeText={setTime} placeholder="Time e.g. 10:00 AM" placeholderTextColor="#94A3B8" editable={!busy} style={{ color: "white", minHeight: 44 }} />
      <TextInput accessibilityLabel="Explicit service duration in minutes" value={duration} onChangeText={setDuration} placeholder="Duration in whole minutes" placeholderTextColor="#94A3B8" keyboardType="number-pad" editable={!busy} style={{ color: "white", minHeight: 44 }} />
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void run(technician ? "review-legacy" : "propose")} style={{ minHeight: 44 }}><Text style={{ color: "#60A5FA" }}>{busy ? "Saving schedule…" : technician ? "Confirm reviewed legacy interval" : "Propose schedule change"}</Text></TouchableOpacity>
    </>}
    {!!message && <Text accessibilityRole="alert" style={{ color: "#CBD5E1" }}>{message}</Text>}
  </View>;
}
