import { Server } from "socket.io";

let io = null;

/**
 * Rooms:
 *  - "global"                 -> every connected client (big-board live tiles)
 *  - `route:${destinationCode}` -> clients viewing one destination's detail page
 *  - `user:${userId}`          -> targeted alerts for a signed-in user
 */
export function initWebSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.join("global");
    console.log(`[ws] client connected: ${socket.id} (${io.engine.clientsCount} online)`);

    socket.on("subscribe:route", (destinationCode) => {
      if (typeof destinationCode === "string") {
        socket.join(`route:${destinationCode.toUpperCase()}`);
      }
    });

    socket.on("unsubscribe:route", (destinationCode) => {
      if (typeof destinationCode === "string") {
        socket.leave(`route:${destinationCode.toUpperCase()}`);
      }
    });

    socket.on("subscribe:user", (userId) => {
      if (typeof userId === "string") {
        socket.join(`user:${userId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[ws] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("WebSocket server not initialized — call initWebSocket() first");
  return io;
}

/** Broadcast a live price tile update to everyone watching the big board. */
export function broadcastPriceUpdate(payload) {
  getIO().to("global").emit("price:update", payload);
}

/**
 * A confirmed fare-drop (>15% below the trailing daily average) — pushed to
 * the global board AND to anyone subscribed to that specific route's detail
 * page, per the "Fare Drop Alerts" spec.
 */
export function broadcastFareDrop(payload) {
  getIO().to("global").emit("fare:drop", payload);
  getIO().to(`route:${payload.destination}`).emit("fare:drop", payload);
}

/** Targeted push for a signed-in user's Price Lock / custom alert. */
export function notifyUser(userId, event, payload) {
  getIO().to(`user:${userId}`).emit(event, payload);
}
