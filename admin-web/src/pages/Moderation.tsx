import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { auth, db } from "../firebase/config";
type Report = { id: string; reporterId: string; targetUserId: string; contentKind: string; contentId: string; reason: string; status: string };
export default function Moderation() {
  const [reports, setReports] = useState<Report[]>([]), [error, setError] = useState(""), [resolution, setResolution] = useState<Record<string, string>>({});
  useEffect(() => onSnapshot(query(collection(db, "content_reports"), where("status", "in", ["open", "reviewing"]), limit(50)), snapshot => {
    setReports(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Report)); setError("");
  }, () => setError("Unable to load moderation reports. Check access and deployed rules.")), []);
  const decide = async (report: Report, status: "reviewing" | "resolved") => {
    const note = resolution[report.id]?.trim() ?? "";
    if (note.length < 10) { setError("Record a resolution or investigation note of at least 10 characters."); return; }
    try { await updateDoc(doc(db, "content_reports", report.id), { status, resolution: note, reviewedBy: auth.currentUser?.uid, reviewedAt: serverTimestamp() }); setError(""); }
    catch { setError("Unable to save the moderation decision."); }
  };
  const visibility = async (report: Report, hidden: boolean) => {
    try {
      await setDoc(doc(db, "content_restrictions", `${report.contentKind}_${report.contentId}`), {
        kind: report.contentKind, contentId: report.contentId, hidden, updatedAt: serverTimestamp(),
      }); setError("Visibility preference saved. Add the decision to the private report; original job evidence is retained.");
    } catch { setError("Unable to change visibility."); }
  };
  return <div className="page-content"><h1>Content & user reports</h1>
    <p>Up to 50 open or reviewing reports. Resolved reports leave this queue so further pending reports can appear. Review context before acting. Use existing account controls for suspension; do not erase shared booking evidence.</p>
    {!!error && <p role="alert">{error}</p>}
    {reports.map(report => <section key={report.id} className="card" style={{ padding: 20, marginBottom: 18 }}>
      <h2>{report.contentKind} · {report.status}</h2><p>Content: {report.contentId} · Target: {report.targetUserId}</p>
      <p>Reporter: {report.reporterId}</p><p style={{ whiteSpace: "pre-wrap" }}>{report.reason}</p>
      <label>Private investigation / resolution note<textarea maxLength={2000} value={resolution[report.id] ?? ""} onChange={event => setResolution(current => ({ ...current, [report.id]: event.target.value }))} /></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        <button onClick={() => { void decide(report, "reviewing"); }}>Mark reviewing</button><button onClick={() => { void decide(report, "resolved"); }}>Resolve report</button>
        {["profile", "review"].includes(report.contentKind) && <><button onClick={() => { void visibility(report, true); }}>Hide content in app</button><button onClick={() => { void visibility(report, false); }}>Restore visibility</button></>}
      </div>
    </section>)}
    {!reports.length && !error && <p>No reports in this window.</p>}
  </div>;
}
