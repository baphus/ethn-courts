"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { DialogFooter, DialogHeader } from "@/components/ui/dialog"

export type ConfirmOptions = { title?: string; confirmLabel?: string; destructive?: boolean }
type Request = { message: React.ReactNode; options: ConfirmOptions; host: Element; resolve: (confirmed: boolean) => void }
type ConfirmContextValue = (message: React.ReactNode, options?: ConfirmOptions) => Promise<boolean>
const ConfirmContext = React.createContext<ConfirmContextValue | null>(null)

function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState<Request | null>(null)
  const pending = React.useRef<Request | null>(null)
  const dialog = React.useRef<HTMLDialogElement>(null)
  const cancel = React.useRef<HTMLButtonElement>(null)
  const titleId = React.useId(), messageId = React.useId()
  const confirm = React.useCallback<ConfirmContextValue>((message, options = {}) => new Promise((resolve) => {
    if (pending.current) { resolve(false); return }
    // Stay inside the current modal's focus and accessibility boundary.
    const host = document.activeElement?.closest('[data-slot="dialog-content"], [data-slot="sheet-content"], dialog[open]') ?? document.body
    pending.current = { message, options, host, resolve }
    setActive(pending.current)
  }), [])
  React.useLayoutEffect(() => {
    const element = dialog.current
    if (active && element && !element.open) {
      element.showModal()
      cancel.current?.focus()
    }
  }, [active])
  React.useEffect(() => () => { pending.current?.resolve(false); pending.current = null }, [])

  return <ConfirmContext.Provider value={confirm}>
    {children}
    {active && createPortal(<dialog ref={dialog} aria-labelledby={titleId} aria-describedby={messageId} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-auto overscroll-contain rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-black/60" onKeyDown={event => { if (event.key === "Escape") event.stopPropagation() }} onClose={event => {
      const answer = event.currentTarget.returnValue === "confirm"
      event.currentTarget.returnValue = ""
      if (pending.current !== active) return
      pending.current = null
      setActive(null)
      active.resolve(answer)
    }}>
      <form method="dialog" className="grid gap-4" onSubmit={event => event.stopPropagation()}>
        <DialogHeader>
          <h2 id={titleId} className="text-lg font-semibold">{active.options.title ?? "Are you sure?"}</h2>
          <p id={messageId} className="whitespace-pre-line text-muted-foreground">{active.message}</p>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancel} type="submit" value="cancel" variant="outline">Cancel</Button>
          <Button type="submit" value="confirm" variant={active.options.destructive ? "destructive" : "default"}>{active.options.confirmLabel ?? "Confirm"}</Button>
        </DialogFooter>
      </form>
    </dialog>, active.host)}
  </ConfirmContext.Provider>
}

function useConfirm() {
  const confirm = React.useContext(ConfirmContext)
  if (!confirm) throw new Error("useConfirm must be used within ConfirmProvider")
  return confirm
}

export { ConfirmProvider, useConfirm }
