import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import config from "../config";
import { ChatService } from "../app/modules/Chat/chat.service";

// Track online users: userId -> socketId
const onlineUsers = new Map<string, string>();

let ioInstance: SocketServer;
export const initSocketServer = (httpServer: HttpServer): SocketServer => {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*", 
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  ioInstance = io;

  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
    if (!token) return next(new Error("Authentication token missing"));

    try {
      const decoded = jwt.verify(token, config.jwt.secret as string) as any;
      socket.data.userId = decoded.id;
      socket.data.role = decoded.role;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId: string = socket.data.userId;
    
    // Join a private room for personal notifications
    socket.join(userId);
    console.log(`[Socket] Connected: ${userId} (Joined private room)`);

    onlineUsers.set(userId, socket.id);
    io.emit("user:online", { userId });

    // ── Auto-join all rooms for this user ─────────────────────────────────────
    ChatService.getUserRoomIds(userId).then((roomIds) => {
      roomIds.forEach((roomId) => {
        socket.join(roomId);
        console.log(`[Socket] ${userId} auto-joined room ${roomId}`);
      });
    });

    // ── Join a chat room ──────────────────────────────────────────────────────
    socket.on("chat:join", (chatRoomId: string) => {
      socket.join(chatRoomId);
      console.log(`[Socket] ${userId} joined room ${chatRoomId}`);
    });

    // ── Leave a chat room ─────────────────────────────────────────────────────
    socket.on("chat:leave", (chatRoomId: string) => {
      socket.leave(chatRoomId);
      console.log(`[Socket] ${userId} left room ${chatRoomId}`);
    });

    // ── Send a message ────────────────────────────────────────────────────────
    socket.on(
      "chat:send",
      async ({ chatRoomId, content }: { chatRoomId: string; content: string }) => {
        if (!content?.trim()) return;

        try {
          const message = await ChatService.saveMessage(chatRoomId, userId, content.trim());

          // Broadcast to everyone in the room (including sender for confirmation)
          io.to(chatRoomId).emit("chat:message", message);
        } catch (err: any) {
          socket.emit("chat:error", { message: err.message });
        }
      }
    );

    // ── Typing indicator ──────────────────────────────────────────────────────
    socket.on(
      "chat:typing",
      ({ chatRoomId, isTyping }: { chatRoomId: string; isTyping: boolean }) => {
        // Broadcast to everyone in the room EXCEPT the sender
        socket.to(chatRoomId).emit("chat:typing", { userId, isTyping });
      }
    );

    // ── User reads messages ───────────────────────────────────────────────────
    socket.on("chat:read", async ({ chatRoomId }: { chatRoomId: string }) => {
      try {
        await ChatService.markAsRead(chatRoomId, userId);
        // Notify the other party their messages were read
        socket.to(chatRoomId).emit("chat:read", { chatRoomId, readBy: userId });
      } catch (err: any) {
        socket.emit("chat:error", { message: err.message });
      }
    });

    // ── Check if a user is online ─────────────────────────────────────────────
    socket.on("user:status", (targetUserId: string) => {
      const isOnline = onlineUsers.has(targetUserId);
      socket.emit("user:status", { userId: targetUserId, isOnline });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      io.emit("user:offline", { userId });
      console.log(`[Socket] Disconnected: ${userId}`);
    });
  });

  return io;
};

// Helper to check if a user is online (used by other services)
export const isUserOnline = (userId: string): boolean => onlineUsers.has(userId);

// Helper to check if a user is in a specific room
export const isUserInRoom = (userId: string, roomId: string): boolean => {
  if (!ioInstance) return false;
  const socketId = onlineUsers.get(userId);
  if (!socketId) return false;
  const room = ioInstance.sockets.adapter.rooms.get(roomId);
  return room ? room.has(socketId) : false;
};

// Helper to get the IO instance (used by Notification service)
export const getSocketIO = () => {
  if (!ioInstance) throw new Error("Socket.io not initialized");
  return ioInstance;
};
