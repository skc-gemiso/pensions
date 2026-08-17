import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { uploadFile } from "@/lib/supabase-storage"
import { getPensionPool } from "@/lib/pension-db"
import { guardApi } from "@/lib/guard"

export async function POST(req: NextRequest) {
  const denied = await guardApi()
  if (denied) return denied

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const refType = formData.get("refType") as string | null
    const refId = formData.get("refId") as string | null

    if (!file || !refType || !refId) {
      return NextResponse.json({ error: "file, refType, refId 필수" }, { status: 400 })
    }

    const ext = file.name.split(".").pop() ?? "bin"
    const storagePath = `${refType}/${refId}/${randomUUID()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadFile(storagePath, buffer, file.type || "application/octet-stream")

    const pool = getPensionPool()
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO my_shopping_file (ref_type, ref_id, file_nm, storage_path, mime_type, file_size)
       VALUES ($1, $2::int, $3, $4, $5, $6) RETURNING id`,
      [refType, Number(refId), file.name, storagePath, file.type || null, file.size]
    )

    return NextResponse.json({ fileId: rows[0].id, storage_path: storagePath })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
