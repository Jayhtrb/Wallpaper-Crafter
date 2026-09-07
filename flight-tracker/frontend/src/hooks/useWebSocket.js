import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const WS_BASE = import.meta.env.VITE_WS_BASE || "http://localhost:4000";

/**
 * Connects once, keeps a rolling map of the latest tile per destination as
 * `price:update` / `fare:drop` events arrive, and exposes the most recent
 * fare-drop event separately so the UI can flash a toast for it.
 */
export function useLiveBigBoard() {
  const socketRef = useRef(null);
  const [tiles, setTiles] = useState({});
  const [lastFareDrop, setLastFareDrop] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(WS_BASE, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("price:update", (tile) => {
      setTiles((prev) => ({ ...prev, [tile.destination]: tile }));
    });

    socket.on("fare:drop", (tile) => {
      setLastFareDrop(tile);
      setTiles((prev) => ({ ...prev, [tile.destination]: tile }));
    });

    return () => socket.disconnect();
  }, []);

  function subscribeToRoute(destination) {
    socketRef.current?.emit("subscribe:route", destination);
  }

  function unsubscribeFromRoute(destination) {
    socketRef.current?.emit("unsubscribe:route", destination);
  }

  return { tiles, lastFareDrop, connected, subscribeToRoute, unsubscribeFromRoute };
}
