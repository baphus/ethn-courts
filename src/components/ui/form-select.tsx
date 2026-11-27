"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { cn } from "cn"

export type FormSelectOption = { value: string; label: React.ReactNode; disabled?: boolean }

type FormSelectProps = Omit<SelectPrimitive.Root.Props<string>, "children" | "onValueChange"> & {
  options: FormSelectOption[]
  placeholder?: string
  className?: string
  positionerClassName?: string
  onValueChange?: (value: string | null) => void
} & Pick<React.AriaAttributes, "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid">

function FormSelect({ options, placeholder = "Select…", className, positionerClassName, id, "aria-label": label, "aria-labelledby": labelledBy, "aria-describedby": describedBy, "aria-invalid": invalid, ...props }: FormSelectProps) {
  return (
    <SelectPrimitive.Root {...props} items={options}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={cn("flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive", className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="truncate" />
        <SelectPrimitive.Icon className="shrink-0"><ChevronDownIcon className="size-4 opacity-50" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner className={cn("z-50 outline-none", positionerClassName)} sideOffset={4}>
          <SelectPrimitive.Popup data-slot="select-content" className="max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none">
            {options.map((option) => <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled} className="relative flex cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
              <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              <SelectPrimitive.ItemIndicator className="absolute right-2"><CheckIcon className="size-4" /></SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>)}
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export { FormSelect }
