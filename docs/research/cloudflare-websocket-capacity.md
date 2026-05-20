# Cloudflare WebSocket Capacity for Realtime Sessions

This note summarizes current Cloudflare Workers and Durable Objects constraints for a realtime WebSocket service. It focuses on whether 150-200 concurrent users should be a scaling concern, and how to structure the service so it can shed load or scale horizontally if message volume grows.

Research date: 2026-05-20.

## Bottom Line

150-200 concurrent WebSocket clients should not be an issue for Cloudflare by raw connection count if the service is built with Workers and Durable Objects in the intended pattern.

The main risk is not "too many connected users." The main risk is a hot single Durable Object doing too much work per incoming message, especially if every message is broadcast to every connected client. Durable Objects are the right primitive for a room, lobby, match, or session, but each individual Durable Object is single-threaded.

Recommended default:

- Use a Worker as the public gateway for auth, validation, and routing.
- Route each game room, lobby, match, or shard to a deterministic Durable Object name.
- Use Durable Objects' WebSocket Hibernation API via `ctx.acceptWebSocket(server)`.
- Add per-socket rate limits and room capacity caps before the product needs them.
- Shard by natural game unit first; only add more complex fan-out/load-balancing once metrics show a hot object.

## Relevant Cloudflare Limits

Cloudflare's Durable Object WebSocket Hibernation API permits a maximum of 32,768 WebSocket connections per Durable Object. Cloudflare also describes Durable Objects as able to connect thousands of clients per instance. CPU and memory usage can reduce the practical number for a specific workload. Source: Cloudflare Durable Object state API and WebSockets best practices (<https://developers.cloudflare.com/durable-objects/api/state/#acceptwebsocket>, <https://developers.cloudflare.com/durable-objects/best-practices/websockets/>).

A single Durable Object is inherently single-threaded. Cloudflare documents a soft limit of about 1,000 requests per second per individual object. If too much work queues on one object, callers can see overloaded errors. Source: Durable Objects limits and troubleshooting (<https://developers.cloudflare.com/durable-objects/platform/limits/>, <https://developers.cloudflare.com/durable-objects/observability/troubleshooting/>).

Workers and Durable Objects can receive WebSocket messages up to 32 MiB. Larger received messages are closed with a `1009` "Message is too large" response. Source: Workers WebSocket runtime API and Workers changelog (<https://developers.cloudflare.com/workers/runtime-apis/websockets/>, <https://developers.cloudflare.com/changelog/post/2025-10-31-increased-websocket-message-size-limit/>).

Each incoming HTTP request or WebSocket message to a Durable Object resets available CPU time. The default Durable Object CPU limit is 30 seconds per request/message/alarm, and can be increased through Worker limits where appropriate. Source: Durable Objects limits (<https://developers.cloudflare.com/durable-objects/platform/limits/>).

The Workers simultaneous open connection limit is not a limit of six connected WebSocket users. It applies to outgoing connections per Worker invocation while waiting for response headers. Cloudflare relaxed this limit in April 2026 so connections stop counting once response headers arrive. Source: Workers limits and changelog (<https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections>, <https://developers.cloudflare.com/changelog/post/2026-04-09-relaxed-connection-limiting/>).

WebSockets are supported on all Cloudflare plans. For normal Cloudflare request accounting, the initial WebSocket upgrade is counted as an HTTP request. For Durable Object billing, incoming WebSocket messages are also billed with a 20:1 ratio for compute request billing, while outgoing WebSocket messages and WebSocket protocol pings are not charged as separate requests. Source: Cloudflare WebSockets network docs and Durable Objects pricing (<https://developers.cloudflare.com/network/websockets/>, <https://developers.cloudflare.com/durable-objects/platform/pricing/>).

## Architecture Recommendation

Use a two-layer architecture:

```text
Client WebSocket
  -> Worker gateway
    -> Durable Object for room/lobby/match/shard
```

The gateway Worker should:

- Validate the `Upgrade: websocket` request.
- Authenticate the user.
- Reject invalid or abusive requests before invoking a Durable Object.
- Select a Durable Object by deterministic key, such as `room:${roomId}`, `match:${matchId}`, or `lobby:${region}:${bucket}`.
- Proxy the upgrade request to that Durable Object.

The Durable Object should:

- Accept sockets with `ctx.acceptWebSocket(server)`, not `server.accept()`, so the object can hibernate.
- Use `serializeAttachment()` for per-connection metadata such as user ID, session ID, joined timestamp, and room role.
- Use `getWebSockets()` for broadcast fan-out.
- Keep in-memory state reconstructable after hibernation.
- Persist authoritative state before broadcasting state transitions that matter.

## Why Hibernation Matters

With the standard WebSocket API, open sockets can pin the Durable Object in memory and incur duration charges for the full connection lifetime. With the WebSocket Hibernation API, clients remain connected while the Durable Object sleeps. The object wakes when a message arrives, and billing duration is tied to active execution instead of idle connection time. Source: Durable Objects WebSocket best practices and pricing (<https://developers.cloudflare.com/durable-objects/best-practices/websockets/>, <https://developers.cloudflare.com/durable-objects/platform/pricing/>).

This matters for a game service because many players may stay connected while idle in a lobby, menu, or room. Hibernation makes idle connection count much less important than active message rate.

## Capacity Assessment for 150-200 Users

For 150-200 users in one room or service instance:

- Raw WebSocket count: comfortably below documented Durable Object limits.
- Idle connections: not a meaningful scaling risk with hibernation.
- Low-frequency chat or presence updates: likely fine in one Durable Object.
- Turn-based game events: likely fine in one Durable Object if messages are compact and validation is cheap.
- High-frequency realtime movement or state sync: needs care, because a single object processes messages serially.
- Broadcast-everything-to-everyone loops: can become the bottleneck as `message_rate * connected_clients` grows.

Rule of thumb: if the service processes tens of messages per second in a room, one Durable Object should be fine. If it processes hundreds or thousands of messages per second in one room, design sharding and batching before launch.

## Load Shedding

Add cheap protection at the Worker and Durable Object layers.

Worker gateway:

- Reject non-WebSocket requests to the WebSocket endpoint.
- Authenticate before creating or calling a Durable Object stub.
- Enforce a maximum connection count per user/account/IP bucket if abuse is possible.
- Use deterministic room routing so retries do not create accidental new hot objects.

Durable Object:

- Track `connectionCount` from `ctx.getWebSockets().length`.
- Reject joins once a room reaches a configured cap, such as 200 for MVP or 500 after testing.
- Apply per-socket message rate limits.
- Apply per-room message rate limits.
- Drop or coalesce non-critical messages, such as cursor/presence/movement deltas.
- Close clients that exceed limits with an application-specific close reason.
- Do not retry operations when Cloudflare marks an exception as `.overloaded`; retrying overload worsens the queue.

Application protocol:

- Prefer state deltas over full snapshots.
- Batch multiple logical messages into one WebSocket frame.
- Use a small typed envelope with sequence numbers.
- Treat visual-only updates as lossy.
- Require acknowledgement only for authoritative state transitions.

## Load Balancing and Sharding Patterns

### Natural Room Sharding

Use one Durable Object per room, match, battle, lobby, or map zone:

```text
ROOM.getByName(`room:${roomId}`)
MATCH.getByName(`match:${matchId}`)
ZONE.getByName(`zone:${mapId}:${zoneId}`)
```

This is the best first scaling model. It keeps strongly consistent state local to the entity that needs coordination.

### Lobby Buckets

If a lobby can grow without bound, split it into buckets:

```text
lobby:global:0
lobby:global:1
lobby:global:2
```

The gateway can assign users based on current counts, region, hash of account ID, or random choice among non-full buckets. A lightweight directory object can track approximate bucket occupancy.

### Room Partitions

For a very large room, split sockets across partitions:

```text
room:${roomId}:partition:0
room:${roomId}:partition:1
room:${roomId}:partition:2
```

Use a coordinator Durable Object only for authoritative room-level decisions. Partition objects handle local sockets and fan-out. This adds complexity, so only use it when one room has proven hot.

### Regional or Map-Zone Routing

For an overworld or multiplayer map, route by zone rather than by whole world:

```text
world:${worldId}:map:${mapId}:zone:${zoneX}:${zoneY}
```

Players crossing zone boundaries reconnect or subscribe to adjacent zones. This avoids one global object for all world activity.

### Queue-Based Fan-Out

For non-interactive or lower-priority fan-out, use Queues or another async channel to decouple producers from consumers. This is useful for analytics, notifications, durable event processing, or background snapshots. It is usually not the right path for latency-sensitive per-frame game state.

## Overload Signals to Monitor

Monitor for:

- Durable Object overloaded errors.
- Queue time or request latency spikes on a specific object name.
- High incoming WebSocket message rate.
- High broadcast loop duration.
- High CPU per WebSocket message.
- Memory growth from retained per-socket state.
- Connection churn and reconnect storms.
- Message sizes approaching the 32 MiB limit.

Cloudflare overload errors can include:

- `Durable Object is overloaded. Too many requests queued.`
- `Durable Object is overloaded. Too much data queued.`
- `Durable Object is overloaded. Requests queued for too long.`
- `Durable Object is overloaded. Too many requests for the same object within a 10 second window.`

Source: Durable Objects troubleshooting (<https://developers.cloudflare.com/durable-objects/observability/troubleshooting/>).

## MVP Guidance for This Project

For a Pokemon-style Soroban game or browser game service, 150-200 connected users should be treated as a normal target, not a special scaling event.

Recommended MVP setup:

1. One Durable Object per lobby, battle room, or overworld zone.
2. A hard room cap of 200 until load testing proves a higher number.
3. Hibernatable WebSockets only.
4. Per-user message rate limits.
5. Message batching for movement and presence.
6. Lossy/coalesced handling for non-authoritative updates.
7. Authoritative transitions persisted before broadcast.
8. Basic metrics for connections, messages per second, broadcast time, and overload errors.

Avoid:

- One global Durable Object for every user.
- Broadcasting every high-frequency movement tick to every connected client.
- Large per-client state objects held only in memory.
- Using `blockConcurrencyWhile()` around normal message handling.
- Retrying overloaded Durable Object calls without backoff or routing changes.

## Practical Conclusion

The expected 150-200 concurrent users are not a concern by themselves. A single hibernatable Durable Object can likely handle that connection count comfortably for low or moderate message rates.

The design should still assume hot rooms can happen. Shard by room or zone now, cap room size, batch messages, rate-limit clients, and watch for Durable Object overload errors. That gives a simple MVP path while preserving a clean route to horizontal scaling if a specific lobby, room, or map zone becomes busy.

