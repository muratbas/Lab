const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const { parse } = require("url");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handle);
  const io = new Server(httpServer);

  // Game/Room State (In-Memory for now)
  const rooms = new Map(); // roomId -> { players: [], gameState: {} }

  io.on("connection", (socket) => {
    // console.log("Client connected", socket.id);

    socket.on("create-room", () => {
      // 4 harfli kod oluştur (A-Z)
      const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      rooms.set(roomId, {
        players: [{ id: socket.id, ready: false, targetCard: null }],
        status: "waiting", // waiting, playing
      });
      socket.join(roomId);
      socket.emit("room-created", roomId);
    });

    socket.on("join-room", (roomId) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit("error", "Oda bulunamadı.");
            return;
        }
        if (room.players.length >= 2) {
            socket.emit("error", "Oda dolu.");
            return;
        }

        room.players.push({ id: socket.id, ready: false, targetCard: null });
        socket.join(roomId);
        
        // Notify everyone in room
        io.to(roomId).emit("player-joined", { playerCount: room.players.length });
        
        // If 2 players, logic to start or waiting for ready
        if (room.players.length === 2) {
             io.to(roomId).emit("ready-to-start");
        }
    });

    socket.on("start-game", ({ roomId, allCards }) => { 
        const room = rooms.get(roomId);
        if (!room) return;

        if (!allCards || allCards.length === 0) return;

        // 1. Shuffle all cards
        const shuffled = [...allCards].sort(() => 0.5 - Math.random());

        // 2. Select 36 cards for the board (6x6)
        const boardCards = shuffled.slice(0, 36);

        // 3. Select targets FROM the board cards
        const target1Index = Math.floor(Math.random() * boardCards.length);
        let target2Index = Math.floor(Math.random() * boardCards.length);

        // Ensure distinct targets if possible (unless only 1 card exists)
        while (boardCards.length > 1 && target2Index === target1Index) {
             target2Index = Math.floor(Math.random() * boardCards.length);
        }

        const player1Target = boardCards[target1Index];
        const player2Target = boardCards[target2Index];

        room.players[0].targetCard = player1Target;
        room.players[1].targetCard = player2Target;
        room.status = "playing";

        // Send targets and the shared board to players
        io.to(room.players[0].id).emit("game-started", { target: player1Target, board: boardCards });
        io.to(room.players[1].id).emit("game-started", { target: player2Target, board: boardCards });
    });

    socket.on("disconnect", () => {
        // Handle cleanup if needed
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
