import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal supplies focus trapping, background inertness and Escape support. */
export function TechnicianDialog({ title, subtitle, busy, onClose, children }: {
  title: string; subtitle: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous?.isConnected && !previous.hasAttribute("disabled")) previous.focus();
      else document.querySelector<HTMLElement>("[data-technician-heading]")?.focus();
    };
  }, []);
  return <dialog className="tm-dialog" ref={ref} aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]'
      )).filter(element => element.getClientRects().length > 0);
      const first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
    <header className="tm-dialog-header">
      <div><p className="tm-eyebrow">ServicePilot · Technician review</p><h2 id={titleId}>{title}</h2><p>{subtitle}</p></div>
      <button type="button" className="tm-icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </header>
    {children}
  </dialog>;
}
