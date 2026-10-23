/** Canonical SVG coordinates, shared by capture and persisted signature previews. */
export const SIGNATURE_WIDTH = 320;
export const SIGNATURE_HEIGHT = 180;
export const SIGNATURE_STROKE = 2;

/** Inverse of SVG xMidYMid meet. Local responder coordinates need no screen/safe-area offset. */
export function signaturePoint(width: number, height: number, x: number, y: number) {
  if (![width, height, x, y].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const scale = Math.min(width / SIGNATURE_WIDTH, height / SIGNATURE_HEIGHT);
  const left = (width - SIGNATURE_WIDTH * scale) / 2;
  const top = (height - SIGNATURE_HEIGHT * scale) / 2;
  const inset = SIGNATURE_STROKE / 2;
  return {
    x: Math.max(inset, Math.min(SIGNATURE_WIDTH - inset, (x - left) / scale)),
    y: Math.max(inset, Math.min(SIGNATURE_HEIGHT - inset, (y - top) / scale)),
  };
}
