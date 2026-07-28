import { createClient } from "@supabase/supabase-js"

const BUCKET = "shopping"
const CONTENT_BUCKET = "shopping-images"

function getClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경 변수가 없습니다")
  return createClient(url, key)
}

export async function uploadFile(
  path: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const supabase = getClient()
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  })
  if (error) throw new Error(`Storage 업로드 실패: ${error.message}`)
  return path
}

export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const supabase = getClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error || !data) throw new Error(`Signed URL 생성 실패: ${error?.message}`)
  return data.signedUrl
}

export async function deleteFile(path: string): Promise<void> {
  const supabase = getClient()
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(`Storage 삭제 실패: ${error.message}`)
}

// 본문 인라인 이미지 — 공개 버킷 (shopping-images), 영구 public URL 반환
export async function uploadContentImage(
  path: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const supabase = getClient()
  const { error } = await supabase.storage.from(CONTENT_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  })
  if (error) throw new Error(`Content image 업로드 실패: ${error.message}`)
  const { data } = supabase.storage.from(CONTENT_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
