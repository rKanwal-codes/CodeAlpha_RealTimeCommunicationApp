const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 10 * 1024 * 1024 // allow up to 10MB for file sharing
});

const JWT_SECRET = "codealpha_secret_key_change_in_production";

// ---------- Simple in-memory "auth" (no real DB needed for this task) ----------
const users = {}; // username -> password (demo only)

app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  if (users[username]) {
    return res.status(400).json({ error: "User already exists" });
  }
  users[username] = password;
  return res.json({ success: true });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!users[username] || users[username] !== password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "2h" });
  return res.json({ token, username });
});

// ---------- Rooms / participants ----------
// roomId -> Set of socket ids
const rooms = {};

function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token provided"));
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.username = decoded.username;
    return next();
  } catch (err) {
    return next(new Error("Authentication failed"));
  }
}

io.use(authenticateSocket);

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.username} (${socket.id})`);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    socket.roomId = roomId;

    if (!rooms[roomId]) rooms[roomId] = new Set();
    rooms[roomId].add(socket.id);

    // Tell the new user who is already in the room
    const otherUsers = Array.from(rooms[roomId]).filter((id) => id !== socket.id);
    socket.emit("existing_users", otherUsers);

    // Tell everyone else a new user joined
    socket.to(roomId).emit("user_joined", { socketId: socket.id, username: socket.username });

    io.to(roomId).emit("system_message", `${socket.username} joined the room`);
  });

  // ---- WebRTC signaling relay (mesh network) ----
  socket.on("webrtc_offer", ({ to, offer }) => {
    io.to(to).emit("webrtc_offer", { from: socket.id, username: socket.username, offer });
  });

  socket.on("webrtc_answer", ({ to, answer }) => {
    io.to(to).emit("webrtc_answer", { from: socket.id, answer });
  });

  socket.on("webrtc_ice_candidate", ({ to, candidate }) => {
    io.to(to).emit("webrtc_ice_candidate", { from: socket.id, candidate });
  });

  // ---- Screen sharing notification (renegotiation handled via webrtc events) ----
  socket.on("screen_share_started", () => {
    socket.to(socket.roomId).emit("screen_share_started", { socketId: socket.id, username: socket.username });
  });

  socket.on("screen_share_stopped", () => {
    socket.to(socket.roomId).emit("screen_share_stopped", { socketId: socket.id });
  });

  // ---- Encrypted text chat ----
  // Message arrives already AES-encrypted from client; server just relays it.
  socket.on("chat_message", (encryptedPayload) => {
    io.to(socket.roomId).emit("chat_message", {
      from: socket.username,
      payload: encryptedPayload,
      time: Date.now()
    });
  });

  // ---- File sharing (small files, base64 chunks relayed via socket.io) ----
  socket.on("file_share", ({ fileName, fileType, fileData }) => {
    socket.to(socket.roomId).emit("file_share", {
      from: socket.username,
      fileName,
      fileType,
      fileData
    });
  });

  // ---- Whiteboard sync ----
  socket.on("whiteboard_draw", (strokeData) => {
    socket.to(socket.roomId).emit("whiteboard_draw", strokeData);
  });

  socket.on("whiteboard_clear", () => {
    socket.to(socket.roomId).emit("whiteboard_clear");
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.username} (${socket.id})`);
    if (socket.roomId && rooms[socket.roomId]) {
      rooms[socket.roomId].delete(socket.id);
      socket.to(socket.roomId).emit("user_left", { socketId: socket.id, username: socket.username });
      io.to(socket.roomId).emit("system_message", `${socket.username} left the room`);
      if (rooms[socket.roomId].size === 0) delete rooms[socket.roomId];
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Real-Time Communication App server running on http://localhost:${PORT}`);
});
