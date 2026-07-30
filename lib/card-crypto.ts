import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

/**
 * my_card 의 민감 컬럼(card_no, cvc, limit_ym) 양방향 암호화.
 *
 * - AES-256-GCM (인증 태그로 위조 감지)
 * - 저장 형식: enc:v1:<iv_b64>:<tag_b64>:<cipher_b64>
 * - 키: CARD_ENC_KEY 환경변수 (32바이트 base64) — 분실 시 복호화 불가
 *
 * 상세: docs/life/cost/cost_task.md 민감정보 암호화 절
 */

const ALGO = "aes-256-gcm"
const PREFIX = "enc:v1:"
const IV_BYTES = 12

function getKey(): Buffer {
  const raw = process.env.CARD_ENC_KEY
  if (!raw) {
    throw new Error("CARD_ENC_KEY 환경변수가 없습니다. config/.env 에 32바이트 base64 키를 등록하세요.")
  }
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error(`CARD_ENC_KEY 는 32바이트 base64 여야 합니다 (현재 ${key.length}바이트).`)
  }
  return key
}

/** 이미 암호화된 값인지 판별 — 평문 레거시 값과 구분 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX)
}

/**
 * 평문 → 암호문. null·빈 문자열은 그대로 반환하고,
 * 이미 암호문이면 재암호화하지 않는다 (마이그레이션 재실행 안전).
 */
export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return null
  if (isEncrypted(plain)) return plain

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return PREFIX + [iv, tag, enc].map(b => b.toString("base64")).join(":")
}

/**
 * 암호문 → 평문. 접두사가 없으면 평문으로 보고 그대로 반환한다.
 * 키가 다르거나 값이 훼손되면 예외가 발생한다.
 */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === "") return null
  if (!isEncrypted(stored)) return stored

  const parts = stored.slice(PREFIX.length).split(":")
  if (parts.length !== 3) {
    throw new Error("암호문 형식이 올바르지 않습니다 (enc:v1:<iv>:<tag>:<cipher>).")
  }
  const [ivB64, tagB64, dataB64] = parts

  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ])
  return dec.toString("utf8")
}

/** 카드번호 뒤 4자리 추출 (구분자 제거 후) — 평문 표시용 card_no_last4 값 */
export function extractLast4(cardNo: string | null | undefined): string | null {
  if (!cardNo || isEncrypted(cardNo)) return null
  const digits = cardNo.replace(/\D/g, "")
  return digits.length >= 4 ? digits.slice(-4) : null
}
