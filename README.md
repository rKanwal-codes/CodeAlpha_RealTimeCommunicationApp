# CodeAlpha_RealTimeCommunicationApp

**Internship:** CodeAlpha — Full Stack Development (Task 4)

A real-time video conferencing & collaboration web app built with **WebRTC**, **Socket.io**, **Node.js/Express**, and vanilla **HTML/CSS/JS**.

## ✨ Features

- 🔐 **User Authentication** — register/login (JWT-based session)
- 📹 **Multi-user Video Calling** — peer-to-peer mesh connections via WebRTC
- 🎤 **Audio/Video Controls** — mute mic, turn camera on/off
- 🖥️ **Screen Sharing** — share your screen instead of camera, one click to stop
- 💬 **Encrypted Text Chat** — messages are AES-encrypted client-side (CryptoJS) before being sent through the server, so the server only ever relays ciphertext
- 📎 **File Sharing** — share files inside a room (demo limit: 8MB)
- 🎨 **Collaborative Whiteboard** — draw together in real time, synced via Socket.io
- 🚪 **Rooms** — join any room by typing a Room ID; only people in the same room see/hear each other

## 🛠️ Tech Stack

| Layer      | Tech |
|------------|------|
| Frontend   | HTML, CSS, JavaScript, WebRTC API, Canvas API |
| Backend    | Node.js, Express.js, Socket.io |
| Real-time  | Socket.io (signaling + chat + whiteboard), WebRTC (media streams) |
| Security   | JWT auth, AES message encryption (CryptoJS) |

## 📁 Project Structure

```
CodeAlpha_RealTimeCommunicationApp/
├── server.js          # Express + Socket.io server, auth & signaling
├── package.json
└── public/
    ├── index.html     # Auth screen + main app UI
    ├── style.css
    └── app.js         # WebRTC logic, chat, file share, whiteboard
```

## 🚀 Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open `http://localhost:5000` in two or more browser tabs/devices.

4. Register a user (or just log in if testing locally with any username/password since storage is in-memory), then enter the same **Room ID** in each tab to join the same call.

## ⚠️ Notes for Production

- Replace the in-memory `users` object with a real database (MongoDB/PostgreSQL).
- Move `JWT_SECRET` and the chat `ENCRYPTION_KEY` into environment variables (`.env`), never hardcode them.
- Serve over **HTTPS/WSS** — required for `getUserMedia`/`getDisplayMedia` on most browsers outside `localhost`.
- For large-scale calls, add a **TURN server** (e.g. coturn) in addition to the STUN server, since mesh WebRTC alone won't traverse all NATs/firewalls reliably.
- For file sharing beyond a few MB, switch from base64-over-socket to chunked transfer or a dedicated upload endpoint/object storage.

## 📝 Internship Submission Checklist

- [ ] Push this code to a GitHub repo named `CodeAlpha_RealTimeCommunicationApp`
- [ ] Record a short video walkthrough and post on LinkedIn, tagging @CodeAlpha
- [ ] Submit via the official CodeAlpha submission form
## 👩‍💻 Author

**Rukhsana Kanwal**
Computer Engineering Student
CodeAlpha Full Stack Development Intern
