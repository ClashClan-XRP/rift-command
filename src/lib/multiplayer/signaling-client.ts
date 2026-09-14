/**
 * WebRTC still needs a tiny handshake channel before peers can talk directly.
 * On the Grok app that is `/api/rtc`. On static hosts (GitHub Pages) that
 * route does not exist, so we fall back to a public MQTT broker and only
 * put SDP/ICE on the wire — game ticks stay on the WebRTC data channel.
 */
import mqtt, { type MqttClient } from "mqtt";
import type { RtcPollResponse, SignalKind, SignalRow } from "./p2p";

export type SignalingPath = "http" | "mqtt" | "unknown";

const MQTT_URLS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
];
const HELLO_MS = 2000;
const PEER_TTL_MS = 8000;

type HelloMsg = { t: "hello"; peer: string; name: string };
type ByeMsg = { t: "bye"; peer: string };
type SigMsg = {
  t: "signal";
  id: number;
  from: string;
  to: string;
  kind: SignalKind;
  payload: unknown;
};
type BusMsg = HelloMsg | ByeMsg | SigMsg;

function topic(room: string) {
  return `riftcmd/v1/${room}`;
}

async function httpPoll(
  room: string,
  peer: string,
  name: string,
  since: number,
): Promise<RtcPollResponse> {
  const params = new URLSearchParams({
    room,
    peer,
    name,
    since: String(since),
  });
  const res = await fetch(`/api/rtc?${params}`);
  const type = res.headers.get("content-type") ?? "";
  if (res.status === 404 || type.includes("text/html")) {
    throw Object.assign(new Error("no http signaling"), { fallback: true });
  }
  if (!res.ok) throw new Error(`signaling poll failed: ${res.status}`);
  return (await res.json()) as RtcPollResponse;
}

async function httpPost(body: unknown): Promise<void> {
  const res = await fetch("/api/rtc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`signal POST failed: ${res.status}`);
}

export class SignalingClient {
  path: SignalingPath = "unknown";
  private mqtt: MqttClient | null = null;
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private seq = 0;
  private inbox: SignalRow[] = [];
  private roster = new Map<string, { name: string; seen: number }>();
  private connecting: Promise<void> | null = null;

  constructor(
    private readonly room: string,
    private readonly selfId: string,
    private readonly name: string,
  ) {}

  async poll(since: number): Promise<RtcPollResponse> {
    if (this.path === "mqtt") return this.drainMqtt(since);
    if (this.path === "http") return httpPoll(this.room, this.selfId, this.name, since);
    try {
      const body = await httpPoll(this.room, this.selfId, this.name, since);
      this.path = "http";
      return body;
    } catch (err) {
      if (!(err as { fallback?: boolean }).fallback) throw err;
      this.path = "mqtt";
      await this.ensureMqtt();
      return this.drainMqtt(since);
    }
  }

  async post(body: {
    op: "signal" | "leave";
    room: string;
    from?: string;
    to?: string;
    kind?: SignalKind;
    payload?: unknown;
    peer?: string;
  }): Promise<void> {
    if (this.path === "mqtt") {
      if (body.op === "leave") {
        this.publish({ t: "bye", peer: this.selfId });
        return;
      }
      this.publish({
        t: "signal",
        id: Date.now() * 100 + (this.seq++ % 100),
        from: this.selfId,
        to: body.to ?? "",
        kind: body.kind ?? "ice",
        payload: body.payload,
      });
      return;
    }
    await httpPost(body);
  }

  close(): void {
    this.closed = true;
    if (this.helloTimer) clearInterval(this.helloTimer);
    this.helloTimer = null;
    if (this.path === "mqtt") {
      this.publish({ t: "bye", peer: this.selfId });
      this.mqtt?.end(true);
      this.mqtt = null;
      return;
    }
    void httpPost({ op: "leave", room: this.room, peer: this.selfId }).catch(() => {});
  }

  private drainMqtt(since: number): RtcPollResponse {
    this.touchSelf();
    const now = Date.now();
    for (const [id, row] of this.roster) {
      if (now - row.seen > PEER_TTL_MS) this.roster.delete(id);
    }
    const signals = this.inbox.filter((s) => s.id > since);
    this.inbox = this.inbox.filter((s) => s.id > since).slice(-200);
    return {
      peers: [...this.roster.entries()].map(([id, row]) => ({ id, name: row.name })),
      signals,
    };
  }

  private touchSelf() {
    this.roster.set(this.selfId, { name: this.name, seen: Date.now() });
  }

  private publish(msg: BusMsg) {
    if (!this.mqtt?.connected) return;
    this.mqtt.publish(topic(this.room), JSON.stringify(msg), { qos: 0 });
  }

  private onBus(raw: string) {
    let msg: BusMsg;
    try {
      msg = JSON.parse(raw) as BusMsg;
    } catch {
      return;
    }
    if (msg.t === "hello") {
      this.roster.set(msg.peer, { name: msg.name, seen: Date.now() });
      return;
    }
    if (msg.t === "bye") {
      if (msg.peer !== this.selfId) this.roster.delete(msg.peer);
      return;
    }
    if (msg.t === "signal" && msg.to === this.selfId && msg.from !== this.selfId) {
      this.inbox.push({
        id: msg.id,
        from: msg.from,
        kind: msg.kind,
        payload: msg.payload,
      });
    }
  }

  private ensureMqtt(): Promise<void> {
    if (this.mqtt?.connected) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = this.connectMqtt().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connectMqtt(): Promise<void> {
    let last: unknown;
    for (const url of MQTT_URLS) {
      try {
        await this.openBroker(url);
        this.touchSelf();
        this.publish({ t: "hello", peer: this.selfId, name: this.name });
        if (!this.helloTimer) {
          this.helloTimer = setInterval(() => {
            if (this.closed) return;
            this.touchSelf();
            this.publish({ t: "hello", peer: this.selfId, name: this.name });
          }, HELLO_MS);
        }
        return;
      } catch (err) {
        last = err;
      }
    }
    throw last instanceof Error ? last : new Error("mqtt signaling failed");
  }

  private openBroker(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(url, {
        clientId: `rc-${this.selfId}-${Math.random().toString(36).slice(2, 6)}`,
        clean: true,
        reconnectPeriod: 2500,
        connectTimeout: 8000,
        protocolVersion: 4,
      });
      const fail = (err: Error) => {
        client.end(true);
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error(`mqtt timeout ${url}`)), 9000);
      client.on("connect", () => {
        clearTimeout(timer);
        client.subscribe(topic(this.room), { qos: 0 }, (err) => {
          if (err) {
            fail(err);
            return;
          }
          this.mqtt = client;
          resolve();
        });
      });
      client.on("message", (_t, payload) => {
        this.onBus(payload.toString());
      });
      client.on("error", () => {
        /* reconnectPeriod handles live errors after connect */
      });
      client.once("error", (err) => {
        if (this.mqtt !== client) {
          clearTimeout(timer);
          fail(err instanceof Error ? err : new Error("mqtt error"));
        }
      });
    });
  }
}
