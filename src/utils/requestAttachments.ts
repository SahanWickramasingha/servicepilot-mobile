export function validateRequestPaths(paths: string[], uid: string, id: string) {
  if (paths.length > 2 || new Set(paths).size !== paths.length || paths.some((p) =>
    !/^r2:v1:[a-f0-9]{64}$/.test(p) && ![0, 1].some((slot) => p === `request_attachments/${uid}/${id}/${slot}`))) throw new Error("Invalid request attachments.");
}
