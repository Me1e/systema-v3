"use client"

import type React from "react"

import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { LoaderCircle } from "lucide-react"

export function SubmitButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
      {pending ? "저장 중..." : children}
    </Button>
  )
}
