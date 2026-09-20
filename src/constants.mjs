export const PROTOCOL_VERSION = 2;
export const MAX_PLAYERS = 4;
export const MAX_FRAME_BYTES = 65_536;
export const MAX_STRING_LENGTH = 256;
export const DEFAULT_PORT = 37_333;
export const DEFAULT_SAVE_PORT = 37_334;
export const DEFAULT_BIND = "127.0.0.1";
export const MIN_SCHEDULE_LEAD = 8;
export const MAX_SCHEDULE_LEAD = 600;
export const MAX_REQUESTS_PER_SECOND = 30;
export const MAX_SESSION_MESSAGES = 100_000;
export const MAX_OUTBOUND_BYTES_PER_PEER = 262_144;
export const MAX_PENDING_CONNECTIONS = 16;
export const MAX_USERDATA_IPC_BYTES = 4_096;
export const MAX_SAVE_BYTES = 2_147_483_648;
export const SAVE_REQUEST_TTL_MS = 30_000;
export const JOIN_CODE_TTL_MS = 30 * 60 * 1000;
export const SAVE_ENCRYPTION_CHUNK_BYTES = 64 * 1024;
export const HELLO_TIMEOUT_MS = 5_000;
export const SUPPORTED_SPEEDS = Object.freeze([0, 1, 2, 4]);
// Accepted for helper/diagnostic use after static API review, not gameplay proof.
export const AUDITED_EXE_SHA256 =
  "a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5";
export const AUDITED_STEAM_BUILD = "25396671";
export const BUILD_VALIDATION = "static-api-audit";
export const GAMEPLAY_VERIFIED = false;
