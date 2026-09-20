import net from "node:net";
import { FrameDecoder, decodeFrame, encodeFrame, makeBody } from "./protocol.mjs";
import { DEFAULT_PORT } from "./constants.mjs";
import { MAX_SESSION_MESSAGES } from "./constants.mjs";

export function connectClient({ secret, sessionId, host = "127.0.0.1", port = DEFAULT_PORT, displayName, buildHash, modManifestHash, onMessage = () => {} }) {
  const socket = net.createConnection({ host, port });
  const deadline = setTimeout(() => socket.destroy(Object.assign(new Error("admission timeout"), { code: "ADMISSION_TIMEOUT" })), 15_000);
  deadline.unref();
  const decoder = new FrameDecoder();
  let sequence = 0;
  let lastServerSequence = -1;
  const seenServerMessages = new Set();
  let playerId = null;
  const send = (kind, payload) => socket.write(encodeFrame(secret, makeBody({ kind, sequence: sequence++, sessionId, playerId, payload })));
  socket.on("connect", () => send("hello", { displayName, buildHash, modManifestHash }));
  socket.on("data", (chunk) => {
    try {
      for (const frame of decoder.push(chunk)) {
        const body = decodeFrame(secret, frame);
        if (body.sessionId !== sessionId) throw new Error("session mismatch");
        if (body.sequence <= lastServerSequence || seenServerMessages.has(body.messageId)) throw new Error("host replay or ordering violation");
        if (seenServerMessages.size >= MAX_SESSION_MESSAGES) throw new Error("session message budget exhausted");
        lastServerSequence = body.sequence;
        seenServerMessages.add(body.messageId);
        if (body.kind === "admitted") { playerId = body.payload.player.playerId; clearTimeout(deadline); }
        onMessage(body, { send, socket, get playerId() { return playerId; } });
      }
    } catch (error) {
      onMessage({ kind: "transport_error", payload: { code: error.code ?? "BAD_HOST_MESSAGE" } }, { send, socket, get playerId() { return playerId; } });
      socket.destroy();
    }
  });
  socket.on("error", (error) => onMessage({ kind: "transport_error", payload: { code: error.code ?? "SOCKET_ERROR" } }, { send, socket, get playerId() { return playerId; } }));
  socket.on("close", () => { clearTimeout(deadline); onMessage({ kind: "session_ended", payload: {} }, { send, socket, get playerId() { return playerId; } }); });
  return { socket, send, get playerId() { return playerId; } };
}
