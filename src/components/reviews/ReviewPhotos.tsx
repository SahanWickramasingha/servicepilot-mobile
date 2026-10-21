import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth } from "@/src/firebase/config";
import { loadReviewPhoto, publishReviewPhotos } from "@/src/services/reviewPhotos.service";

/** No download-token URLs or cross-account image cache. Each fetch is authorized. */
export function ReviewPhotos({ paths = [], customerId }: { paths?: string[]; customerId: string }) {
  const [viewer, setViewer] = useState(auth.currentUser?.uid ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => auth.onAuthStateChanged((user) => { setViewer(user?.uid ?? null); setSelected(null); }), []);
  if (!viewer || viewer !== auth.currentUser?.uid || !paths.length) return null;
  return <View>
    <View style={styles.row}>{paths.slice(0, 5).map((path, index) => <PhotoThumbnail key={`${viewer}/${path}`} path={path}
      label={`Review photo ${index + 1} of ${Math.min(paths.length, 5)}`} viewer={viewer} customerId={customerId} onOpen={setSelected} />)}</View>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
      <View style={styles.viewer} accessibilityViewIsModal>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close review photo" style={styles.close} onPress={() => setSelected(null)}>
          <Text style={styles.text}>Close photo</Text>
        </TouchableOpacity>
        {selected && <Image source={{ uri: selected }} style={styles.large} resizeMode="contain" accessible accessibilityLabel="Enlarged review photo" />}
      </View>
    </Modal>
  </View>;
}
function PhotoThumbnail({ path, label, customerId, viewer, onOpen }: {
  path: string; label: string; customerId: string; viewer: string; onOpen: (uri: string) => void;
}) {
  const [uri, setUri] = useState<string | null>(null), [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const active = useRef(false), generation = useRef(0);
  const load = async () => {
    const version = ++generation.current;
    const current = () => active.current && generation.current === version && auth.currentUser?.uid === viewer;
    setLoading(true); setError(false);
    try {
      // Resume an interrupted publication only as the owner of the saved review.
      if (viewer === customerId) await publishReviewPhotos([path]);
      const next = await loadReviewPhoto(path);
      if (current()) setUri(next);
    } catch { if (current()) setError(true); }
    finally { if (current()) setLoading(false); }
  };
  useEffect(() => {
    active.current = true; void load();
    // This ref deliberately invalidates pending loads during cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { active.current = false; generation.current++; };
    // Each instance is keyed by the viewer/path pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={error ? `${label} unavailable. Retry` : `Open ${label.toLowerCase()}`}
    style={styles.thumb} disabled={loading} onPress={() => uri ? onOpen(uri) : void load()}>
    {loading ? <ActivityIndicator color="#60A5FA" /> : error ? <Text style={styles.error}>Photo unavailable. Retry</Text>
      : uri && <Image source={{ uri }} resizeMethod="resize" style={styles.image} accessibilityLabel={label} />}
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  thumb: { width: 72, height: 72, borderRadius: 10, overflow: "hidden", backgroundColor: "#17263A", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" }, error: { color: "#FCA5A5", fontSize: 10, padding: 4, textAlign: "center" },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)", padding: 20, paddingTop: 60 },
  large: { flex: 1, width: "100%" }, close: { minHeight: 48, justifyContent: "center", alignSelf: "flex-end", padding: 12 }, text: { color: "white", fontSize: 16 },
});
