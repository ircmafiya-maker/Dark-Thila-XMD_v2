import { io, Socket } from "socket.io-client";
import { useCallback, useEffect } from "react";
import { SessionStatus } from "@workspace/api-client-react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getListSessionsQueryKey } from "@workspace/api-client-react";

let socket: Socket | null = null;
const joinedSessions = new Set<string>();
let listenersBoundFor: QueryClient | null = null;

function getOrCreateSocket(): Socket {
  if (socket) return socket;
  socket = io({
    path: "/api/socket.io",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  // On (re)connect, re-join every previously joined session room
  socket.on("connect", () => {
    for (const sid of joinedSessions) {
      socket!.emit("join-session", sid);
    }
  });

  return socket;
}

function bindCacheListeners(queryClient: QueryClient) {
  if (listenersBoundFor === queryClient) return;
  listenersBoundFor = queryClient;
  const s = getOrCreateSocket();

  s.off("session-update");
  s.off("session-removed");

  s.on("session-update", (data: SessionStatus) => {
    queryClient.setQueryData<SessionStatus[]>(getListSessionsQueryKey(), (old) => {
      if (!old) return [data];
      const exists = old.find((x) => x.sessionId === data.sessionId);
      if (exists) {
        return old.map((x) => (x.sessionId === data.sessionId ? data : x));
      }
      return [...old, data];
    });
  });

  s.on("session-removed", (sessionId: string) => {
    joinedSessions.delete(sessionId);
    queryClient.setQueryData<SessionStatus[]>(getListSessionsQueryKey(), (old) => {
      if (!old) return [];
      return old.filter((x) => x.sessionId !== sessionId);
    });
  });
}

export function useSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    bindCacheListeners(queryClient);
  }, [queryClient]);

  const joinSession = useCallback((sessionId: string) => {
    if (!sessionId) return;
    joinedSessions.add(sessionId);
    const s = getOrCreateSocket();
    if (s.connected) {
      s.emit("join-session", sessionId);
    }
    // If not connected yet, the "connect" handler will re-join on connect.
  }, []);

  return { socket: getOrCreateSocket(), joinSession };
}
