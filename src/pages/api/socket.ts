import { Server } from "socket.io";

const rooms = new Map();

const SocketHandler = (req: any, res: any) => {
  if (res.socket.server.io) {
    console.log('Socket is already running');
    res.end();
    return;
  }

  const io = new Server(res.socket.server, {
    path: "/api/socket/io",
    addTrailingSlash: false,
  });
  res.socket.server.io = io;

  io.on("connection", (socket) => {
    socket.on("create-room", (playerName) => {
      const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      rooms.set(roomId, {
        players: [{ id: socket.id, name: playerName || "Oyuncu 1", ready: false, targetCard: null }],
        status: "waiting", 
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
        
        io.to(roomId).emit("player-joined", { 
            playerCount: room.players.length,
            players: room.players.map((p: any) => p.name)
        });
        
        if (room.players.length === 2) {
             io.to(roomId).emit("ready-to-start");
             io.to(roomId).emit("update-players", room.players.map((p: any) => p.name));
        }
    });

    socket.on("start-game", ({ roomId, allCards }) => { 
        const room = rooms.get(roomId);
        if (!room) return;

        if (!allCards || allCards.length === 0) return;

        const shuffled = [...allCards].sort(() => 0.5 - Math.random());
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

        room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;
        const nextPlayerId = room.players[room.currentTurnIndex].id;
        
        io.to(roomId).emit("turn-update", nextPlayerId);
    });

    socket.on("make-guess", ({ roomId, guessedCard }) => {
        const room = rooms.get(roomId);
        if (!room || room.status !== "playing") return;

        const currentPlayer = room.players[room.currentTurnIndex];
        if (currentPlayer.id !== socket.id) return;

        const opponentIndex = (room.currentTurnIndex + 1) % 2;
        const opponent = room.players[opponentIndex];

        let winnerId = null;

        if (guessedCard === opponent.targetCard) {
            winnerId = currentPlayer.id;
        } else {
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

         const player = room.players.find((p: any) => p.id === socket.id);
         if (player) {
             player.ready = true;
         }

         const allReady = room.players.length === 2 && room.players.every((p: any) => p.ready);

         if (allReady) {
             room.status = "playing"; 
             io.to(roomId).emit("restart-loading"); 
         } else {
             io.to(roomId).emit("player-status-update", { 
                 readyPlayerId: socket.id, 
                 message: `${player.name} tekrar oynamak istiyor...` 
             });
         }
    });
    
    socket.on("request-restart-with-cards", ({ roomId, allCards }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        
        if (!allCards || !Array.isArray(allCards) || allCards.length === 0) {
            console.error("Missing cards for restart");
            return;
        }
        
        room.players.forEach((p: any) => p.ready = false);
        
        const shuffled = [...allCards].sort(() => 0.5 - Math.random());
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
  });

  res.end();
}

export default SocketHandler;
