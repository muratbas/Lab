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
  const io = new Server(httpServer, {
    path: "/api/socket/io",
    addTrailingSlash: false,
  });

  // Game/Room State (In-Memory for now)
  const rooms = new Map(); // roomId -> { players: [], gameState: {} }

  io.on("connection", (socket) => {
    // console.log("Client connected", socket.id);

    socket.on("create-room", (playerName) => {
      // 4 harfli kod oluştur (A-Z)
      const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      rooms.set(roomId, {
        players: [{ id: socket.id, name: playerName || "Oyuncu 1", ready: false, targetCard: null }],
        status: "waiting", // waiting, playing
      });
      socket.join(roomId);
      socket.emit("room-created", roomId);
    });

    socket.on("join-room", ({ roomId, playerName }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit("error", "Oda bulunamadı.");
            return;
        }
        if (room.players.length >= 2) {
            socket.emit("error", "Oda dolu.");
            return;
        }

        room.players.push({ id: socket.id, name: playerName || "Oyuncu 2", ready: false, targetCard: null });
        socket.join(roomId);
        
        // Notify everyone in room
        io.to(roomId).emit("player-joined", { 
            playerCount: room.players.length,
            players: room.players.map(p => p.name)
        });
        
        // If 2 players, logic to start or waiting for ready
        if (room.players.length === 2) {
             io.to(roomId).emit("ready-to-start");
             // Send full player list update
             io.to(roomId).emit("update-players", room.players.map(p => p.name));
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
        room.currentTurnIndex = Math.floor(Math.random() * 2); // Random start

        // Send targets and the shared board to players
        const p1 = room.players[0];
        const p2 = room.players[1];

        // Helper to send game start data
        const sendGameStart = () => {
             const turnPlayerId = room.players[room.currentTurnIndex].id;
             
             io.to(p1.id).emit("game-started", { 
                 target: room.players[0].targetCard, 
                 board: boardCards, 
                 opponentName: p2.name,
                 turnPlayerId 
             });
             
             io.to(p2.id).emit("game-started", { 
                 target: room.players[1].targetCard, 
                 board: boardCards, 
                 opponentName: p1.name, 
                 turnPlayerId 
             });
        }
        sendGameStart();
    });

    socket.on("next-turn", (roomId) => {
        const room = rooms.get(roomId);
        if (!room || room.status !== "playing") return;

        // Switch turn
        room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;
        const nextPlayerId = room.players[room.currentTurnIndex].id;
        
        io.to(roomId).emit("turn-update", nextPlayerId);
    });

    socket.on("make-guess", ({ roomId, guessedCard }) => {
        const room = rooms.get(roomId);
        if (!room || room.status !== "playing") return;

        const currentPlayer = room.players[room.currentTurnIndex];
        // Ensure it's this socket's turn (extra safety, though client handles UI)
        if (currentPlayer.id !== socket.id) return;

        const opponentIndex = (room.currentTurnIndex + 1) % 2;
        const opponent = room.players[opponentIndex];

        let winnerId = null;

        if (guessedCard === opponent.targetCard) {
            // Correct guess -> Current player wins
            winnerId = currentPlayer.id;
        } else {
            // Wrong guess -> Opponent wins
            winnerId = opponent.id;
        }

        room.status = "ended";
        io.to(roomId).emit("game-over", { 
            winnerId, 
            player1: { name: room.players[0].name, target: room.players[0].targetCard },
            player2: { name: room.players[1].name, target: room.players[1].targetCard }
        });
    });

    socket.on("restart-game", (roomId) => {
         const room = rooms.get(roomId);
         if (!room) return;

         // Find the player who requested restart
         const player = room.players.find(p => p.id === socket.id);
         if (player) {
             player.ready = true;
         }

         // Check if both players are ready
         const allReady = room.players.length === 2 && room.players.every(p => p.ready);

         if (allReady) {
             // Reset game state but keep players
             room.status = "playing"; // Will be effectively set in start-game logic, but good to mark
             
             // Reset ready flags for next time? Or keep them? 
             // Better to reset them AFTER start. 
             // Actually, let's just trigger start-game logic immediately.
             // We need 'allCards' again. We don't have them here explicitly unless we stored them or client sends them.
             // Let's ask clients to 'restart-confirmed' and the creator client will send 'start-game' again automatically?
             // OR simpler: we store allCards in room? (Might be heavy if huge). 
             // Better: Emit "player-ready" to everyone. If both ready, emit "restart-now" to Creator to trigger start-game.
             
             io.to(roomId).emit("restart-loading"); // Show loading or "Starting..."
             
             // We need the cards. Let's ask the creator to send them again via start-game.
             // Or simpler: The restart-game event from client SHOULD send the cards if possible, or we just rely on the Creator to trigger it.
         } else {
             // Notify others that one player is ready
             io.to(roomId).emit("player-status-update", { 
                 readyPlayerId: socket.id, 
                 message: `${player.name} tekrar oynamak istiyor...` 
             });
         }
    });
    
    // New listener for robust restart
    socket.on("request-restart-with-cards", ({ roomId, allCards }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        
        if (!allCards || !Array.isArray(allCards) || allCards.length === 0) {
            console.error("Missing cards for restart");
            return;
        }
        
        // Reset ready stats
        room.players.forEach(p => p.ready = false);
        
        // Re-run start game logic
        // ... (reuse start-game logic, ideally extracted to function)
        // For now, let's just call the same logic as start-game.
         // 1. Shuffle all cards
        const shuffled = [...allCards].sort(() => 0.5 - Math.random());
        // ... same logic ...
        const boardCards = shuffled.slice(0, 36);
        const target1Index = Math.floor(Math.random() * boardCards.length);
        let target2Index = Math.floor(Math.random() * boardCards.length);
        while (boardCards.length > 1 && target2Index === target1Index) {
             target2Index = Math.floor(Math.random() * boardCards.length);
        }
        const player1Target = boardCards[target1Index];
        const player2Target = boardCards[target2Index];

        room.players[0].targetCard = player1Target;
        room.players[1].targetCard = player2Target;
        room.status = "playing";
        room.currentTurnIndex = Math.floor(Math.random() * 2);

        const p1 = room.players[0];
        const p2 = room.players[1];
        
        const turnPlayerId = room.players[room.currentTurnIndex].id;
             
        io.to(p1.id).emit("game-started", { 
            target: room.players[0].targetCard, 
            board: boardCards, 
            opponentName: p2.name,
            turnPlayerId 
        });
             
        io.to(p2.id).emit("game-started", { 
             target: room.players[1].targetCard, 
             board: boardCards, 
             opponentName: p1.name, 
             turnPlayerId 
        });
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
