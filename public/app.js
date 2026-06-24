// ====== Config ======
const SERVER_URL = window.location.origin; // works for both localhost and deployed
const ENCRYPTION_KEY = "codealpha_demo_room_key"; // demo symmetric key for chat encryption

let socket = null;
let localStream = null;
let screenStream = null;
let isScreenSharing = false;
let audioEnabled = true;
let videoEnabled = true;
let roomId = "";
let username = "";

const peers = {}; // socketId -> RTCPeerConnection

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// ====== DOM refs ======
const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");
const authForm = document.getElementById("authForm");
const authError = document.getElementById("authError");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const authSubmit = document.getElementById("authSubmit");
let mode = "login";

tabLogin.onclick = () => { mode = "login"; tabLogin.classList.add("active"); tabRegister.classList.remove("active"); authSubmit.textContent = "Login & Join Room"; };
tabRegister.onclick = () => { mode = "register"; tabRegister.classList.add("active"); tabLogin.classList.remove("active"); authSubmit.textContent = "Register"; };

// ====== Auth ======
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  roomId = document.getElementById("roomId").value.trim();

  try {
    if (mode === "register") {
      const res = await fetch(`${SERVER_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      authError.style.color = "#4dd0e1";
      authError.textContent = "Registered! Now switch to Login.";
      tabLogin.click();
      return;
    }

    const res = await fetch(`${SERVER_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    await startApp(data.token);
  } catch (err) {
    authError.style.color = "#ff6b6b";
    authError.textContent = err.message;
  }
});

// ====== Start the main app after auth ======
async function startApp(token) {
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  document.getElementById("roomLabel").textContent = roomId;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    addVideoTile("local", localStream, `${username} (You)`);
  } catch (err) {
    console.warn("Camera/mic not available, joining without media:", err);
  }

  socket = io(SERVER_URL, { auth: { token } });

  socket.on("connect_error", (err) => alert("Connection failed: " + err.message));

  socket.on("existing_users", (socketIds) => {
    socketIds.forEach((id) => createPeerConnection(id, true));
  });

  socket.on("user_joined", ({ socketId }) => {
    createPeerConnection(socketId, false);
  });

  socket.on("user_left", ({ socketId }) => {
    if (peers[socketId]) { peers[socketId].close(); delete peers[socketId]; }
    removeVideoTile(socketId);
  });

  socket.on("system_message", (text) => addSystemMessage(text));

  // ---- WebRTC signaling ----
  socket.on("webrtc_offer", async ({ from, offer }) => {
    const pc = createPeerConnection(from, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("webrtc_answer", { to: from, answer });
  });

  socket.on("webrtc_answer", async ({ from, answer }) => {
    await peers[from]?.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on("webrtc_ice_candidate", async ({ from, candidate }) => {
    try { await peers[from]?.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn(e); }
  });

  // ---- Chat (encrypted) ----
  socket.on("chat_message", ({ from, payload, time }) => {
    const decrypted = decryptMessage(payload);
    addChatMessage(from, decrypted, time, from === username);
  });

  // ---- File sharing ----
  socket.on("file_share", ({ from, fileName, fileType, fileData }) => {
    addFileMessage(from, fileName, fileType, fileData, false);
  });

  // ---- Whiteboard ----
  socket.on("whiteboard_draw", (stroke) => drawStroke(stroke, false));
  socket.on("whiteboard_clear", () => clearCanvas(false));

  socket.emit("join_room", roomId);
}

// ====== WebRTC peer connection (mesh) ======
function createPeerConnection(remoteId, isInitiator) {
  if (peers[remoteId]) return peers[remoteId];

  const pc = new RTCPeerConnection(ICE_SERVERS);
  peers[remoteId] = pc;

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit("webrtc_ice_candidate", { to: remoteId, candidate: e.candidate });
  };

  pc.ontrack = (e) => {
    addVideoTile(remoteId, e.streams[0], "Peer");
  };

  pc.onconnectionstatechange = () => {
    if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
      removeVideoTile(remoteId);
    }
  };

  if (isInitiator) {
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => socket.emit("webrtc_offer", { to: remoteId, offer: pc.localDescription }));
  }

  return pc;
}

// ====== Video grid helpers ======
function addVideoTile(id, stream, label) {
  let tile = document.getElementById(`tile-${id}`);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "video-tile";
    tile.id = `tile-${id}`;
    tile.innerHTML = `<video autoplay playsinline ${id === "local" ? "muted" : ""}></video><span class="label">${label}</span>`;
    document.getElementById("videoGrid").appendChild(tile);
  }
  tile.querySelector("video").srcObject = stream;
}

function removeVideoTile(id) {
  const tile = document.getElementById(`tile-${id}`);
  if (tile) tile.remove();
}

// ====== Media controls ======
document.getElementById("toggleAudio").onclick = () => {
  audioEnabled = !audioEnabled;
  localStream?.getAudioTracks().forEach((t) => (t.enabled = audioEnabled));
  document.getElementById("toggleAudio").textContent = audioEnabled ? "🎤 Mute" : "🔇 Unmute";
};

document.getElementById("toggleVideo").onclick = () => {
  videoEnabled = !videoEnabled;
  localStream?.getVideoTracks().forEach((t) => (t.enabled = videoEnabled));
  document.getElementById("toggleVideo").textContent = videoEnabled ? "📷 Video Off" : "📹 Video On";
};

document.getElementById("toggleScreenShare").onclick = async () => {
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      Object.values(peers).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
      });

      addVideoTile("local", screenStream, `${username} (Screen)`);
      isScreenSharing = true;
      document.getElementById("toggleScreenShare").textContent = "🛑 Stop Sharing";
      socket.emit("screen_share_started");

      screenTrack.onended = () => stopScreenShare();
    } catch (err) {
      console.warn("Screen share cancelled:", err);
    }
  } else {
    stopScreenShare();
  }
};

function stopScreenShare() {
  if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
  const camTrack = localStream?.getVideoTracks()[0];
  if (camTrack) {
    Object.values(peers).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(camTrack);
    });
    addVideoTile("local", localStream, `${username} (You)`);
  }
  isScreenSharing = false;
  document.getElementById("toggleScreenShare").textContent = "🖥️ Share Screen";
  socket.emit("screen_share_stopped");
}

document.getElementById("leaveBtn").onclick = () => {
  Object.values(peers).forEach((pc) => pc.close());
  localStream?.getTracks().forEach((t) => t.stop());
  socket?.disconnect();
  window.location.reload();
};

// ====== Panel switching ======
document.querySelectorAll(".panel-tab").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".panel-tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel-content").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.panel).classList.add("active");
  };
});

// ====== Encrypted chat ======
function encryptMessage(text) {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}
function decryptMessage(cipherText) {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8) || "[unable to decrypt]";
  } catch {
    return "[unable to decrypt]";
  }
}

document.getElementById("sendChatBtn").onclick = sendChat;
document.getElementById("chatInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChat();
});

function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  const encrypted = encryptMessage(text);
  socket.emit("chat_message", encrypted);
  addChatMessage(username, text, Date.now(), true);
  input.value = "";
}

function addChatMessage(from, text, time, isSelf) {
  const div = document.createElement("div");
  div.className = "msg";
  const t = new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  div.innerHTML = `<span class="sender">${isSelf ? "You" : from}</span><span class="time">${t}</span><br>${escapeHtml(text)}`;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop = 999999;
}

function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "system";
  div.textContent = text;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop = 999999;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ====== File sharing ======
document.getElementById("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    alert("File too large for demo (max 8MB).");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const fileData = reader.result; // base64 data URL
    socket.emit("file_share", { fileName: file.name, fileType: file.type, fileData });
    addFileMessage(username, file.name, file.type, fileData, true);
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

function addFileMessage(from, fileName, fileType, fileData, isSelf) {
  const div = document.createElement("div");
  div.className = "msg file-msg";
  div.innerHTML = `<span class="sender">${isSelf ? "You" : from}</span> shared a file:<br><a href="${fileData}" download="${fileName}" target="_blank">📎 ${escapeHtml(fileName)}</a>`;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop = 999999;
}

// ====== Whiteboard ======
const canvas = document.getElementById("whiteboard");
const ctx = canvas.getContext("2d");
let drawing = false;
let lastPoint = null;

canvas.addEventListener("mousedown", (e) => { drawing = true; lastPoint = getPos(e); });
canvas.addEventListener("mouseup", () => { drawing = false; lastPoint = null; });
canvas.addEventListener("mouseleave", () => { drawing = false; lastPoint = null; });

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const point = getPos(e);
  const stroke = {
    x0: lastPoint.x, y0: lastPoint.y, x1: point.x, y1: point.y,
    color: document.getElementById("wbColor").value,
    size: document.getElementById("wbSize").value
  };
  drawStroke(stroke, true);
  lastPoint = point;
});

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function drawStroke(stroke, broadcast) {
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(stroke.x0, stroke.y0);
  ctx.lineTo(stroke.x1, stroke.y1);
  ctx.stroke();
  if (broadcast) socket.emit("whiteboard_draw", stroke);
}

document.getElementById("wbClear").onclick = () => clearCanvas(true);

function clearCanvas(broadcast) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (broadcast) socket.emit("whiteboard_clear");
}
