import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

const EVENT_COLORS: Record<string, number> = {
  split_created: 0x5865f2,
  split_paid: 0x57f287,
  split_updated: 0xfee75c,
  split_closed: 0xed4245,
  deposited: 0xeb459e,
  distributed: 0x9b59b6,
  control_transfer_proposed: 0xffa500,
  control_transferred: 0x1abc9c,
};

const EVENT_EMOJIS: Record<string, string> = {
  split_created: "\u2795",
  split_paid: "\u{1F4B0}",
  split_updated: "\u{1F504}",
  split_closed: "\u{1F512}",
  deposited: "\u{1F4E5}",
  distributed: "\u{1F4E4}",
  control_transfer_proposed: "\u{1F91D}",
  control_transferred: "\u2705",
};

export interface IndexerEvent {
  ledger: number;
  txHash?: string;
  id?: string;
  type: string;
  at?: string;
  split?: string;
  creator?: string;
  token?: string;
  amount?: string;
  new_controller?: string;
}

export interface DiscordEmbed {
  title: string;
  color: number;
  description: string;
  timestamp?: string;
  fields: { name: string; value: string; inline?: boolean }[];
}

export interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

export function eventColor(eventType: string): number {
  return EVENT_COLORS[eventType] ?? 0x95a5a6;
}

export function eventEmoji(eventType: string): string {
  return EVENT_EMOJIS[eventType] ?? "\u2753";
}

export function formatTypeLabel(eventType: string): string {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatAmount(amount: string | undefined): string {
  if (!amount) return "—";
  const num = BigInt(amount);
  if (num === 0n) return "0";
  const whole = num / 10_000_000n;
  const frac = num % 10_000_000n;
  if (frac === 0n) return whole.toString();
  const padded = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}.${padded}`;
}

export function embedFromEvent(event: IndexerEvent): DiscordEmbed {
  const emoji = eventEmoji(event.type);
  const label = formatTypeLabel(event.type);
  const fields: DiscordEmbed["fields"] = [
    { name: "Ledger", value: `#${event.ledger}`, inline: true },
  ];

  if (event.split !== undefined) {
    fields.push({ name: "Split ID", value: event.split, inline: true });
  }
  if (event.amount !== undefined) {
    fields.push({
      name: "Amount (XLM)",
      value: formatAmount(event.amount),
      inline: true,
    });
  }
  if (event.token !== undefined) {
    fields.push({ name: "Token", value: event.token, inline: true });
  }
  if (event.creator !== undefined) {
    fields.push({
      name: "Creator",
      value: `\`${event.creator}\``,
      inline: false,
    });
  }
  if (event.new_controller !== undefined) {
    fields.push({
      name: "New Controller",
      value: `\`${event.new_controller}\``,
      inline: false,
    });
  }
  if (event.txHash !== undefined) {
    fields.push({
      name: "Transaction",
      value: `\`${event.txHash}\``,
      inline: false,
    });
  }

  return {
    title: `${emoji} ${label}`,
    color: eventColor(event.type),
    description: `Event on split **#${event.split ?? "?"}**`,
    timestamp: event.at,
    fields,
  };
}

export function buildPayload(events: IndexerEvent[]): DiscordWebhookPayload {
  return { embeds: events.map(embedFromEvent) };
}

export async function postEvents(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
): Promise<Response> {
  if (payload.embeds.length === 0) return new Response(null, { status: 204 });
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(
      `Discord webhook returned ${response.status}: ${text}`,
    );
  }
  return response;
}

export function readEventsSince(
  path: string,
  byteOffset: number,
): { events: IndexerEvent[]; nextOffset: number } {
  if (!existsSync(path)) {
    return { events: [], nextOffset: byteOffset };
  }

  const stats = statSync(path);
  const fileSize = stats.size;

  if (fileSize <= byteOffset) {
    return { events: [], nextOffset: byteOffset };
  }

  const fd = readFileSync(path, "utf8");
  const lines = fd.slice(byteOffset).split("\n").filter((l) => l.trim() !== "");

  const events: IndexerEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as IndexerEvent);
    } catch {
      break;
    }
  }

  return { events, nextOffset: fileSize };
}

function loadOffset(statePath: string): number {
  if (!existsSync(statePath)) return 0;
  try {
    const data = JSON.parse(readFileSync(statePath, "utf8"));
    return typeof data.byteOffset === "number" ? data.byteOffset : 0;
  } catch {
    return 0;
  }
}

function saveOffset(statePath: string, byteOffset: number): void {
  writeFileSync(statePath, JSON.stringify({ byteOffset }));
}

function envOrDefault(key: string, fallback: string): string {
  return (process.env[key]?.trim() || fallback);
}

function validateConfig(): {
  webhookUrl: string;
  eventsPath: string;
  statePath: string;
  pollMs: number;
} {
  const webhookUrl = envOrDefault("DISCORD_WEBHOOK_URL", "");
  const eventsPath = envOrDefault("EVENTS_PATH", "events.ndjson");
  const statePath = envOrDefault("STATE_PATH", "discord-bot-state.json");
  const pollMs = Number(envOrDefault("POLL_MS", "15000"));

  if (!webhookUrl) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        message:
          "DISCORD_WEBHOOK_URL is required. Set it in your environment or .env file.",
      }),
    );
    process.exit(1);
  }

  const errors: string[] = [];
  if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    errors.push("DISCORD_WEBHOOK_URL must be a valid Discord webhook URL");
  }
  if (!Number.isFinite(pollMs) || pollMs < 1000) {
    errors.push("POLL_MS must be a number >= 1000");
  }

  if (errors.length > 0) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Invalid configuration:\n- ${errors.join("\n- ")}`,
      }),
    );
    process.exit(1);
  }

  return { webhookUrl, eventsPath, statePath, pollMs };
}

async function poll(): Promise<void> {
  const { webhookUrl, eventsPath, statePath } = validateConfig();
  log("info", "Polling for new events", { eventsPath, statePath });

  let offset = loadOffset(statePath);
  log("info", "Resumed at byte offset", { byteOffset: offset });

  const pollInterval = Number(envOrDefault("POLL_MS", "15000"));

  const tick = async (): Promise<void> => {
    try {
      const { events, nextOffset } = readEventsSince(eventsPath, offset);
      if (events.length > 0) {
        log("info", `Found ${events.length} new event(s)`, {
          eventCount: events.length,
        });
        const payload = buildPayload(events);
        await postEvents(webhookUrl, payload);
        offset = nextOffset;
        saveOffset(statePath, offset);
        log("info", `Posted ${events.length} event(s) to Discord`, {
          posted: events.length,
        });
      }
    } catch (err) {
      log("error", "Poll execution error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  await tick();
  setInterval(tick, pollInterval);
}

type LogLevel = "info" | "warn" | "error";
function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("/discord-bot.js") ||
    process.argv[1].endsWith("\\discord-bot.js") ||
    process.argv[1].endsWith("/discord-bot.ts") ||
    process.argv[1].endsWith("\\discord-bot.ts"));

if (isMain) {
  poll().catch((err) => {
    log("error", "Fatal error", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
