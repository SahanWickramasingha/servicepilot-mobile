import { bytesToHex } from "@noble/hashes/utils.js";
import { check, objectKey, PhotoError, type PhotoRecord } from "./types";

export function imageType(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
}
export async function boundedPut(request: Request, bucket: R2Bucket, meta: PhotoRecord) {
  check(request.body && request.headers.get("Content-Type")?.split(";")[0] === meta.contentType, 415, "unsupported-image");
  const declared = request.headers.get("Content-Length");
  check(declared === null || /^\d+$/.test(declared) && Number(declared) === meta.size, 400, "invalid-size");
  const reader = request.body.getReader();
  // R2 requires a known-length stream. The reserved size supplies that length,
  // but every byte is independently counted, hashed and limited below. No trust
  // is placed in Content-Length; chunked/missing-length uploads are supported.
  const fixed = new FixedLengthStream(meta.size), writer = fixed.writable.getWriter();
  // Native incremental crypto avoids buffering a whole image or hashing up to
  // 5 MiB in JavaScript on a CPU-constrained Worker.
  const hash = new crypto.DigestStream("SHA-256"), hashWriter = hash.getWriter();
  const checksum = hash.digest; void checksum.catch(() => {});
  let total = 0, prefix = new Uint8Array(0), validated = false, tail: Uint8Array | undefined;
  const cancel = () => { void reader.cancel().catch(() => {}); void writer.abort().catch(() => {}); void hashWriter.abort().catch(() => {}); };
  const timer = setTimeout(cancel, 20_000); request.signal.addEventListener("abort", cancel);
  const put = bucket.put(objectKey(meta), fixed.readable, { onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: meta.contentType, cacheControl: "private, no-store" },
    customMetadata: { photoId: meta.id, sha256: meta.sha256 } });
  const pump = async () => {
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        check(!request.signal.aborted, 408, "interrupted-upload");
        total += part.value.byteLength;
        check(total <= meta.size && (meta.purpose === "request" ? total < 2_000_000 : total <= 5 * 1024 * 1024), 413, "image-too-large");
        await hashWriter.write(part.value);
        if (!validated) {
          const need = Math.min(12 - prefix.length, part.value.length);
          const joined = new Uint8Array(prefix.length + need); joined.set(prefix); joined.set(part.value.subarray(0, need), prefix.length); prefix = joined;
          if (prefix.length === 12 || total === meta.size) {
            check(imageType(prefix) === meta.contentType, 415, "unsupported-image"); validated = true;
          }
        }
        // R2 knows Content-Length and may finish before upstream EOF. Hold back
        // the final byte so no object can commit until the entire input, exact
        // size and actual digest have been validated (including extra chunks).
        if (part.value.length) {
          if (tail) await writer.write(tail);
          if (part.value.length > 1) await writer.write(part.value.subarray(0, part.value.length - 1));
          tail = part.value.slice(-1);
        }
      }
      await hashWriter.close();
      check(validated && total === meta.size && bytesToHex(new Uint8Array(await checksum)) === meta.sha256, 400, "invalid-image");
      if (tail) await writer.write(tail);
      await writer.close();
    } catch (cause) { cancel(); throw cause; }
  };
  try {
    const [, result] = await Promise.all([pump(), put]);
    // A concurrent winner may own the immutable key. Finalization validates it.
    if (!result && !await bucket.head(objectKey(meta))) throw new PhotoError(409, "conflict");
  } finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
