import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { uploadContentImage } from "@/lib/supabase-storage"
import { guardApi } from "@/lib/guard"

export async function POST(req: NextRequest) {
  const denied = await guardApi()
  if (denied) return denied

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "file 필수" }, { status: 400 })

    const ext = file.name.split(".").pop() ?? "png"
    const path = `content/${randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const url = await uploadContentImage(path, buffer, file.type || "image/png")

    return NextResponse.json({ url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
