import { useEffect, useRef, type ReactNode } from 'react'

export default function GuestDialog({ titleId, children, onClose }: { titleId: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    return () => { dialog?.close(); document.body.style.overflow = overflow; if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  return <dialog className="guest-dialog" ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }}>{children}</dialog>
}
