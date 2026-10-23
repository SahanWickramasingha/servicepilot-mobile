import type { Auth, User } from "firebase/auth";
const installed = new WeakSet<Auth>();

/** SDK middleware runs before replacing credentials, including direct SDK calls. */
export function installLocationAuthGuard(auth: Auth,
  before: (auth: Auth, callback: (next: User | null) => Promise<void>) => () => void,
  sharing: () => Promise<{ prepareAuthChange: (previousUid: string) => Promise<void> }>) {
  if (installed.has(auth)) return () => {};
  installed.add(auth);
  const stop = before(auth, async (next) => {
    const previous = auth.currentUser;
    if (previous && previous.uid !== next?.uid) await (await sharing()).prepareAuthChange(previous.uid);
  });
  return () => { stop(); installed.delete(auth); };
}
