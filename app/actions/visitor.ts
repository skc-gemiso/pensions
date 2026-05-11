"use server"

import { headers } from "next/headers"

const LOOPBACK = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1", "localhost"])

export async function getVisitorIp(): Promise<string> {
  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  return LOOPBACK.has(ip) ? "unknown" : ip
}
