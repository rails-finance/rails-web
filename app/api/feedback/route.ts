import { NextRequest, NextResponse } from "next/server";

// Feedback intake — forwards footer feedback-modal submissions to a private
// Telegram team chat via a bot. Nothing is persisted: no storage, and payload
// fields and IPs are never logged. The message is sent as plain text (no
// parse_mode, so markdown/HTML injection into the sink is impossible) with
// link previews disabled. Env vars are server-only — see CLAUDE.md.

export const runtime = "nodejs";

const MAX_BODY_CHARS = 16_384;

const TYPE_LABELS = {
  bug: "\u{1F6E0} Bug report",
  data: "\u{1F4CA} Data correction",
  feature: "\u{1F4A1} Feature request",
} as const;
type FeedbackType = keyof typeof TYPE_LABELS;

// Best-effort in-memory rate limiting. Known limitation (accepted): on Vercel
// this state is per serverless instance, so the caps are approximate. That is
// sufficient because the sink is a private chat — worst case is noise there,
// and rotating the bot token kills any abuse instantly. IPs live only in this
// map for windowing; they are never logged and never sent to Telegram.
const PER_IP_LIMIT = 5;
const PER_IP_WINDOW_MS = 10 * 60 * 1000;
const GLOBAL_LIMIT = 30;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const perIpHits = new Map<string, number[]>();
let globalHits: number[] = [];

function rateLimited(ip: string): boolean {
  const now = Date.now();
  // Prune stale entries on access — no timers in a serverless module.
  for (const [key, hits] of perIpHits) {
    const fresh = hits.filter((t) => now - t < PER_IP_WINDOW_MS);
    if (fresh.length === 0) perIpHits.delete(key);
    else perIpHits.set(key, fresh);
  }
  globalHits = globalHits.filter((t) => now - t < GLOBAL_WINDOW_MS);
  const hits = perIpHits.get(ip) ?? [];
  if (hits.length >= PER_IP_LIMIT || globalHits.length >= GLOBAL_LIMIT) return true;
  hits.push(now);
  perIpHits.set(ip, hits);
  globalHits.push(now);
  return false;
}

// Strip control characters (keep \n) so a payload cannot smuggle terminal
// escapes or other non-printables into the chat message. Trims too.
function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
}

function invalid() {
  // Generic on purpose — never echo submitted values back.
  return NextResponse.json({ error: "Invalid feedback payload" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  // 1. JSON only.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Unsupported media type" }, { status: 415 });
  }

  // 2. Size cap BEFORE parsing.
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return invalid();
  }

  // 3. Honeypot: a hidden "website" field no reader ever sees. Bots that
  //    fill it get a silent success — they must not learn they were caught.
  if (clean(body.website) !== "") {
    return NextResponse.json({ ok: true });
  }

  // 4. Manual validation (no deps; matches the repo's route convention).
  const rawType = body.type;
  if (rawType !== "bug" && rawType !== "data" && rawType !== "feature") return invalid();
  const type: FeedbackType = rawType;
  const title = clean(body.title);
  const description = clean(body.description);
  const contact = clean(body.contact);
  let page = clean(body.page);
  if (description.length < 10 || description.length > 2000) return invalid();
  if (type === "data") {
    if (title !== "") return invalid();
  } else if (title.length < 3 || title.length > 100) {
    return invalid();
  }
  if (contact.length > 100) return invalid();
  if (page.length > 200 || !page.startsWith("/")) page = "(unknown)";

  // 5. Rate limit (after honeypot + validation, so garbage never burns quota).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many submissions — try again later" }, { status: 429 });
  }

  // 6. Deliver. Secrets are read here, inside the handler, and nowhere else.
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FEEDBACK_CHAT_ID;
  if (!token || !chatId) {
    console.error("TELEGRAM_BOT_TOKEN / TELEGRAM_FEEDBACK_CHAT_ID environment variables are not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const lines = [`${TYPE_LABELS[type]} — rails-web-onboarding`, `Page: ${page}`];
  if (contact !== "") lines.push(`Contact: ${contact}`);
  lines.push("");
  if (type !== "data") lines.push(title, "");
  lines.push(description);

  try {
    // Plain text on purpose: NO parse_mode, so markdown/HTML in the payload
    // renders literally in the chat; link previews disabled.
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        link_preview_options: { is_disabled: true },
      }),
    });
    if (!response.ok) {
      // Status code only — never the response body (it can echo the token path).
      console.error(`Telegram sendMessage failed: HTTP ${response.status}`);
      return NextResponse.json({ error: "Delivery failed" }, { status: 502 });
    }
  } catch {
    console.error("Telegram sendMessage failed: network error");
    return NextResponse.json({ error: "Delivery failed" }, { status: 502 });
  }

  // 7. Done.
  return NextResponse.json({ ok: true });
}
