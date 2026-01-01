"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSocket } from "@/lib/socket";
import Image from "next/image";

type GameState = "MENU" | "LOBBY" | "PLAYING" | "ENDED";

function GameContent() {
  const [gameState, setGameState] = useState<GameState>("MENU"); // MENU, LOBBY, PLAYING, ENDED
  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [playerName, setPlayerName] = useState(""); 
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [lobbyPlayers, setLobbyPlayers] = useState<string[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [isCreator, setIsCreator] = useState(false);
  const [error, setError] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  // Game Data
  const [allCards, setAllCards] = useState<string[]>([]);
  const [boardCards, setBoardCards] = useState<string[]>([]);
  const [targetCard, setTargetCard] = useState<string | null>(null);
  const [eliminatedCards, setEliminatedCards] = useState<Set<string>>(new Set());
  const [isTargetRevealed, setIsTargetRevealed] = useState(true);

  // Turn & Guessing State
  const [turnPlayerId, setTurnPlayerId] = useState<string | null>(null);
  const [isGuessingMode, setIsGuessingMode] = useState(false);
  const [gameOverData, setGameOverData] = useState<any>(null); // { winnerId, player1, player2 }
  const [restartStatus, setRestartStatus] = useState("");
  const [opponentReadyMessage, setOpponentReadyMessage] = useState("");

  const socket = getSocket();
  const searchParams = useSearchParams();

  const isMyTurn = turnPlayerId === socket.id;

  // ... (useEffect deps logic remains same)

  // Fetch cards
  useEffect(() => {
    // Vercel için sunucuyu uyandır
    fetch("/api/socket").catch(() => null);
    
    socket.connect(); // Connect explicitly

    fetch("/api/cards")
      .then((res) => res.json())
      .then((data) => setAllCards(data));
  }, []);

  // Socket Listeners
  useEffect(() => {
    socket.on("connect", () => {
      setIsConnected(true);
      setError("");
    });
    socket.on("disconnect", () => {
      setIsConnected(false);
      setError("Bağlantı koptu. Yeniden bağlanılıyor...");
    });

    socket.on("room-created", (code: string) => {
      setRoomCode(code);
      setIsCreator(true);
      setGameState("LOBBY");
      setPlayerCount(1);
      // setLobbyPlayers is handled in createRoom now to ensure correct name
      window.history.replaceState(null, "", `?room=${code}`);
    });

    socket.on("player-joined", ({ playerCount, players }: { playerCount: number, players: string[] }) => {
      setPlayerCount(playerCount);
      if (players) setLobbyPlayers(players);
    });

    socket.on("update-players", (players: string[]) => {
      setLobbyPlayers(players);
    });

    socket.on("error", (msg: string) => {
      setError(msg);
      setTimeout(() => setError(""), 3000);
    });

    socket.on("game-started", ({ target, board, opponentName, turnPlayerId }: { target: string, board: string[], opponentName: string, turnPlayerId: string }) => {
      setTargetCard(target);
      if (board) setBoardCards(board);
      if (opponentName) setOpponentName(opponentName);
      setTurnPlayerId(turnPlayerId);
      setGameState("PLAYING");
      setEliminatedCards(new Set());
      setGameOverData(null);
      setIsGuessingMode(false);
      setRestartStatus(""); 
      setOpponentReadyMessage("");
    });

    socket.on("turn-update", (nextPlayerId: string) => {
        setTurnPlayerId(nextPlayerId);
    });

    socket.on("game-over", (data: any) => {
        setGameOverData(data);
        setGameState("ENDED");
    });

    socket.on("player-status-update", ({ readyPlayerId, message }: { readyPlayerId: string, message: string }) => {
        if (readyPlayerId === socket.id) {
             setRestartStatus("Diğer oyuncu bekleniyor...");
        } else {
             setOpponentReadyMessage(message);
        }
    });

    socket.on("restart-loading", () => {
         setRestartStatus("Oyun başlatılıyor...");
         setOpponentReadyMessage("");
         if (isCreator) {
             socket.emit("request-restart-with-cards", { roomId: roomCode, allCards });
         } else {
             socket.emit("request-restart-with-cards", { roomId: roomCode, allCards });
         }
    });

    return () => {
      socket.off("room-created");
      socket.off("player-joined");
      socket.off("update-players");
      socket.off("error");
      socket.off("game-started");
      socket.off("turn-update");
      socket.off("game-over");
      socket.off("player-status-update");
      socket.off("restart-loading");
    };
  }, [isCreator, roomCode, allCards]);


  // Use a ref to access latest playerName in listeners if needed, 
  // but for creating room we just use the local state which is fine as "createRoom" function triggers the emit with the current state.
  // The listener 'room-created' just sets view state.
  // One edge case: 'room-created' listener uses 'playerName' closure. 
  // If we remove dependency, 'playerName' inside 'room-created' listener might be empty string (initial).
  // FIX: We should update lobbyPlayers based on the name we sent, or just wait for 'update-players'.
  // Actually, simpler fix: Use a specific effect for room creation response or just trust the 'update-players' event which sends the list?
  // Let's rely on setLobbyPlayers update instruction above which used a ref or just don't rely on closure 'playerName'.
  // Actually, 'update-players' will fire when we join? No, creation doesn't fire join?
  // Server 'create-room' does NOT emit player-joined to self?
  // Let's fix 'room-created' listener above to use functional update or correct data source.
  // Actually, 'create-room' on server sets the name.
  // Let's just fix the previous replace to NOT rely on stale playerName closure if possible.
  // But wait, createRoom button calls createRoom function which uses current `playerName` state.
  // The 'room-created' event just acknowledges success. 
  // We can set lobbyPlayers to [playerName] inside createRoom function locally before/after emit? 
  // Or just use a ref for playerName. 
  
  // For now, removing the dependency fixes the input bug. 
  // I updated the 'room-created' block above to use 'playerName' but if this effect runs once on mount, 'playerName' is "".
  // So 'room-created' will set lobby to [""]. This IS a problem for the Creator's lobby view.
  
  // Better approach: handle lobby player setting in the `createRoom` function itself, or use a ref.
 

  const createRoom = () => {
    if (!playerName.trim()) {
      setError("Lütfen bir isim girin.");
      setTimeout(() => setError(""), 2000);
      return;
    }
    socket.emit("create-room", playerName);
    setLobbyPlayers([playerName]);
  };

  const joinRoom = () => {
    if (!playerName.trim()) {
      setError("Lütfen bir isim girin.");
      setTimeout(() => setError(""), 2000);
      return;
    }
    const codeToJoin = inputCode ? inputCode.toUpperCase() : "";
    if (!codeToJoin) return;
    
    socket.emit("join-room", { roomId: codeToJoin, playerName });
    setRoomCode(codeToJoin);
    setGameState("LOBBY");
  };

  const startGame = () => {
    socket.emit("start-game", { roomId: roomCode, allCards });
  };

  const handleNextTurn = () => {
      socket.emit("next-turn", roomCode);
  };

  const handleGuessMode = () => {
      setIsGuessingMode(!isGuessingMode);
  };

  const handleCardClick = (card: string) => {
    if (isGuessingMode) {
        // Send guess (Removed confirm as requested)
        socket.emit("make-guess", { roomId: roomCode, guessedCard: card });
        setIsGuessingMode(false);
    } else {
        // Toggle elimination locally
        const newEliminated = new Set(eliminatedCards);
        if (newEliminated.has(card)) {
          newEliminated.delete(card);
        } else {
          newEliminated.add(card);
        }
        setEliminatedCards(newEliminated);
    }
  };

  const handleRestart = () => {
      setRestartStatus("Diğer oyuncu bekleniyor...");
      socket.emit("restart-game", roomCode);
  };

  // --- RENDERERS ---

  if (gameState === "MENU") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700">
          <h1 className="text-4xl font-bold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Kart Bul
          </h1>
          <div className="text-center mb-6">
             {isConnected ? (
                 <span className="text-xs text-green-500 font-bold px-2 py-1 bg-green-900/30 rounded-full">● SUNUCU BAĞLI</span>
             ) : (
                 <span className="text-xs text-red-500 font-bold px-2 py-1 bg-red-900/30 rounded-full animate-pulse">● BAĞLANTI YOK</span>
             )}
          </div>
          
          <div className="space-y-6">
            <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="ADINIZ"
                className="w-full bg-slate-700 border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-center text-lg mb-4"
              />

            <button
              onClick={createRoom}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-blue-900/50 shadow-lg"
            >
              Oda Kur
            </button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-800 text-slate-400">YA DA</span>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="ODAKODU"
                className="flex-1 bg-slate-700 border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-mono tracking-widest text-center"
              />
              <button
                onClick={joinRoom}
                className="px-6 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-colors"
                disabled={!inputCode}
              >
                Katıl
              </button>
            </div>
            {error && <p className="text-red-400 text-center text-sm mt-2">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === "LOBBY") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Oda Bekleniyor</h2>
          <div className="text-6xl font-mono font-black text-blue-400 my-8 tracking-[0.5em] pl-4 select-all">
            {roomCode}
          </div>
          
          <div className="bg-slate-700/50 rounded-lg p-6 mb-8">
            <h3 className="text-slate-400 text-sm mb-4 uppercase tracking-wider">Oyuncular</h3>
            <div className="space-y-2">
                {lobbyPlayers.map((name, idx) => (
                    <div key={idx} className="flex items-center justify-center gap-2 text-white font-bold">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span>{name} {name === playerName ? "(Sen)" : ""}</span>
                    </div>
                ))}
                {lobbyPlayers.length < 2 && (
                     <div className="flex items-center justify-center gap-2 text-slate-500 italic animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                        <span>Bekleniyor...</span>
                    </div>
                )}
            </div>
          </div>

          {isCreator && (
            <button
              onClick={startGame}
              disabled={playerCount < 2}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-lg
                ${playerCount < 2 
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-400 hover:to-emerald-500 shadow-emerald-900/50'
                }`}
            >
              Baslat
            </button>
          )}
          {!isCreator && (
            <p className="text-slate-400 animate-pulse">Kurucunun baslatmasi bekleniyor...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-2 flex flex-col relative overflow-hidden">
      
      {/* Turn Indicator Overlay */}
      {isMyTurn ? (
          <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 shadow-[0_0_20px_theme(colors.green.500)] z-50 animate-pulse" />
      ) : (
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-500/50 z-50" />
      )}

      {/* Mobile-First Header */}
      <div className="flex flex-col items-center justify-center mb-2 sticky top-2 z-20">
         {/* Center Target Card */}
         {targetCard && (
            <div className="flex items-center gap-4">
                
                {/* Left Player Name */}
                <div className={`text-xs font-bold ${isMyTurn ? 'text-green-400 scale-110' : 'text-slate-500'} transition-all`}>
                    {playerName}
                </div>

                <div className={`transition-all duration-300 relative ${isTargetRevealed ? 'mb-2' : ''}`}>
                {isTargetRevealed ? (
                    <div 
                        className="cursor-pointer relative group"
                        onClick={() => setIsTargetRevealed(false)}
                    >
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap z-10">
                            HEDEF KART
                        </div>
                        <Image 
                        src={`/clash-royale-cards/${targetCard}`}
                        width={80}
                        height={100}
                        alt="Target"
                        className="rounded-lg shadow-2xl border-2 border-amber-400"
                        />
                    </div>
                ) : (
                    <button 
                        onClick={() => setIsTargetRevealed(true)}
                        className="bg-slate-800/80 backdrop-blur border border-amber-500/50 text-amber-500 px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2"
                    >
                        <span>👁️ GÖSTER</span>
                    </button>
                )}
                </div>

                {/* Right Player Name (Opponent) */}
                 <div className={`text-xs font-bold ${!isMyTurn ? 'text-red-400 scale-110' : 'text-slate-500'} transition-all`}>
                    {opponentName || "Rakip"}
                </div>
            </div>
         )}
         
         <div className={`
             px-4 py-1.5 rounded-full border mt-1 shadow-lg transition-colors duration-500
             ${isMyTurn ? 'bg-green-900/80 border-green-500/50' : 'bg-slate-800/60 border-slate-700'}
         `}>
            <p className="text-xs font-medium text-center">
                 {isMyTurn ? (
                     <span className="text-green-400 font-bold animate-pulse">SIRA SENDE!</span>
                 ) : (
                     <span className="text-slate-400">Sıra <span className="text-red-300 font-bold">{opponentName}</span>&apos;de</span>
                 )}
            </p>
         </div>
      </div>

      {/* Guessing Mode Banner */}
      {isGuessingMode && (
          <div className="fixed inset-x-0 top-32 z-30 flex justify-center pointer-events-none">
              <div className="bg-purple-600 text-white px-6 py-2 rounded-full shadow-xl animate-bounce font-bold border-2 border-purple-400">
                  TAHMİN EDECEĞİN KARTA DOKUN!
              </div>
          </div>
      )}

      {/* Grid - Scrollable Area */}
      <div className="flex-1 overflow-y-auto pb-32 px-1 scrollbar-hide">
         <div className="flex justify-center">
             {gameState === "PLAYING" && boardCards.length === 0 ? (
                 <div className="text-center text-slate-400 mt-10">
                     <p className="text-xl mb-4">Kartlar yükleniyor...</p>
                 </div>
             ) : (
             <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 w-full max-w-4xl">
                {boardCards.map((card) => {
                  const isEliminated = eliminatedCards.has(card);
                  return (
                    <div
                      key={card}
                      onClick={() => handleCardClick(card)}
                      className={`
                        relative aspect-[3/4] cursor-pointer transition-all duration-200 transform rounded-lg overflow-hidden border
                        ${isGuessingMode 
                            ? 'hover:scale-105 hover:border-purple-500 hover:shadow-[0_0_15px_theme(colors.purple.500)] border-purple-500/30' 
                            : 'border-slate-700'
                        }
                        ${isEliminated ? 'opacity-40 grayscale border-transparent' : 'active:scale-95 shadow-lg border-slate-600'}
                      `}
                    >
                      <div className="absolute inset-0 bg-slate-800">
                        <Image
                          src={`/clash-royale-cards/${card}`}
                          fill
                          sizes="(max-width: 640px) 25vw, (max-width: 768px) 20vw, 16vw"
                          className="object-cover"
                          alt={card.replace('.png', '')}
                          loading="lazy"
                        />
                      </div>
                      
                      {/* Overlay for eliminated */}
                      {!isGuessingMode && isEliminated && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                           <span className="text-red-500 font-bold text-4xl leading-none">✕</span>
                        </div>
                      )}
                    </div>
                  );
                })}
             </div>
             )}
         </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur border-t border-slate-800 z-40">
          <div className="flex gap-4 max-w-md mx-auto">
              <button
                  onClick={handleNextTurn}
                  disabled={!isMyTurn || isGuessingMode}
                  className={`flex-1 py-4 rounded-xl font-bold text-lg shadow-lg transition-all
                      ${!isMyTurn || isGuessingMode
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white active:scale-95'
                      }
                  `}
              >
                  Sonraki Tur
              </button>
              
              <button
                  onClick={handleGuessMode}
                  disabled={!isMyTurn}
                  className={`flex-1 py-4 rounded-xl font-bold text-lg shadow-lg transition-all border-2
                      ${!isMyTurn
                          ? 'bg-slate-800 text-slate-500 border-transparent cursor-not-allowed'
                          : isGuessingMode
                              ? 'bg-purple-900/50 text-purple-300 border-purple-500'
                              : 'bg-slate-800 text-purple-400 border-purple-500/50 hover:bg-purple-900/20 active:scale-95'
                      }
                  `}
              >
                  {isGuessingMode ? "İptal Et" : "Tahmin Et"}
              </button>
          </div>
      </div>

      {/* Game Over Modal */}
      {(gameState === "ENDED" && gameOverData) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div className="bg-slate-800 border border-slate-600 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden">
                  
                  {/* Result Header */}
                  {gameOverData.winnerId === socket.id ? (
                      <div className="mb-6">
                          <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-2">
                             KAZANDIN! 🏆
                          </h2>
                          <p className="text-amber-200">Harika bir tahmin!</p>
                      </div>
                  ) : (
                      <div className="mb-6">
                          <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-red-600 mb-2">
                             KAYBETTİN 💀
                          </h2>
                          <p className="text-slate-400">Belki bir dahaki sefere...</p>
                      </div>
                  )}

                  {/* Cards Reveal */}
                  <div className="flex justify-center gap-6 mb-8">
                      <div className="flex flex-col items-center">
                          <p className="text-xs text-slate-400 mb-2 font-bold uppercase">Senin Kartın</p>
                          <div className="relative w-20 h-24">
                            <Image 
                                src={`/clash-royale-cards/${gameOverData.winnerId === socket.id ? (gameOverData.player1.name === playerName ? gameOverData.player1.target : gameOverData.player2.target) : (gameOverData.player1.name === playerName ? gameOverData.player1.target : gameOverData.player2.target)}`}
                                fill
                                className="object-cover rounded-lg border-2 border-slate-500"
                                alt="Your Card"
                            />
                          </div>
                      </div>
                      <div className="flex flex-col items-center">
                          <p className="text-xs text-slate-400 mb-2 font-bold uppercase">Rakibin Kartı</p>
                          <div className="relative w-24 h-32 -mt-2 z-10 scale-110 shadow-xl">
                            <Image 
                                src={`/clash-royale-cards/${gameOverData.player1.name !== playerName ? gameOverData.player1.target : gameOverData.player2.target}`}
                                fill
                                className={`object-cover rounded-lg border-4 ${gameOverData.winnerId !== socket.id ? 'border-green-500' : 'border-red-500'}`}
                                alt="Opponent Card"
                            />
                          </div>
                      </div>
                  </div>

                  <div className="space-y-3">
                      <button
                          onClick={handleRestart}
                          disabled={restartStatus !== ""}
                          className={`w-full py-4 rounded-xl font-bold text-lg transition-colors active:scale-95
                             ${restartStatus !== "" 
                                ? 'bg-slate-700 text-slate-400 cursor-wait' 
                                : 'bg-white text-slate-900 hover:bg-slate-200'
                             }
                          `}
                      >
                          {restartStatus ? restartStatus : (opponentReadyMessage ? "KABUL ET VE OYNA" : "TEKRAR OYNA ↻")}
                      </button>
                      
                      {opponentReadyMessage && !restartStatus && (
                         <div className="flex items-center justify-center gap-2 text-green-400 text-sm animate-pulse font-bold">
                            <div className="w-2 h-2 bg-green-500 rounded-full"/>
                            <p>{opponentReadyMessage}</p>
                         </div>
                      )}
                      
                      {restartStatus && (
                         <div className="flex items-center justify-center gap-2 text-slate-400 text-sm animate-pulse">
                            <div className="w-2 h-2 bg-slate-500 rounded-full"/>
                            <p>Diğer oyuncu bekleniyor...</p>
                         </div>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}

export default function KartBulPage() {
    return (
        <Suspense fallback={null}>
            <GameContent />
        </Suspense>
    )
}
