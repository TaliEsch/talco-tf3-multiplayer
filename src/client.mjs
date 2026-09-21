import net from "node:net";
import { FrameDecoder, decodeFrame, encodeFrame, makeBody } from "./protocol.mjs";
import { DEFAULT_PORT } from "./constants.mjs";
import { MAX_SESSION_MESSAGES } from "./constants.mjs";

export function connectClient({ secret, sessionId, host = "127.0.0.1", port = DEFAULT_PORT, displayName, buildHash, modManifestHash, diagnosticOnly = false, onMessage = () => {} }) {
  const socket = net.createConnection({ host, port });
  const deadline = setTimeout(() => socket.destroy(Object.assign(new Error("admission timeout"), { code: "ADMISSION_TIMEOUT" })), 15_000);
  deadline.unref();
  const decoder = new FrameDecoder();
  let sequence = 0;
  let lastServerSequence = -1;
  const seenServerMessages = new Set();
  let playerId = null;
  const sendFrame = (kind, payload) => socket.write(encodeFrame(secret, makeBody({ kind, sequence: sequence++, sessionId, playerId, payload })));
  const send = (kind, payload) => {
    if(diagnosticOnly&&kind!=="diagnostic_ping")throw new Error("DIAGNOSTIC_ONLY");
    return sendFrame(kind,payload);
  };
  socket.on("connect", () => diagnosticOnly ? sendFrame("diagnostic_hello", {}) : send("hello", { displayName, buildHash, modManifestHash }));
  socket.on("data", (chunk) => {
    try {
      for (const frame of decoder.push(chunk)) {
        const body = decodeFrame(secret, frame);
        if (body.sessionId !== sessionId) throw new Error("session mismatch");
        if (body.sequence <= lastServerSequence || seenServerMessages.has(body.messageId)) throw new Error("host replay or ordering violation");
        if (seenServerMessages.size >= MAX_SESSION_MESSAGES) throw new Error("session message budget exhausted");
        lastServerSequence = body.sequence;
        seenServerMessages.add(body.messageId);
        if(diagnosticOnly){
          if(!["diagnostic_ready","diagnostic_pong"].includes(body.kind))throw new Error("DIAGNOSTIC_ONLY");
          if(body.playerId!==null)throw new Error("DIAGNOSTIC_IDENTITY_VIOLATION");
          if(body.kind==="diagnostic_ready")clearTimeout(deadline);
        } else if (body.kind === "admitted") { playerId = body.payload.player.playerId; clearTimeout(deadline); }
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
