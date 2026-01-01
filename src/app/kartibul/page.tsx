"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSocket } from "@/lib/socket";
import Image from "next/image";

type GameState = "MENU" | "LOBBY" | "PLAYING";

function GameContent() {
  const [gameState, setGameState] = useState<GameState>("MENU");
  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [playerCount, setPlayerCount] = useState(0);
  const [isCreator, setIsCreator] = useState(false);
  const [error, setError] = useState("");

  // Game Data
  const [allCards, setAllCards] = useState<string[]>([]);
  const [boardCards, setBoardCards] = useState<string[]>([]); // Cards active in the current game
  const [targetCard, setTargetCard] = useState<string | null>(null);
  const [eliminatedCards, setEliminatedCards] = useState<Set<string>>(new Set());
  const [isTargetRevealed, setIsTargetRevealed] = useState(true);

  const socket = getSocket();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check URL for room code
    const urlRoom = searchParams.get("room");
    if (urlRoom) {
      setInputCode(urlRoom);
    }

    // Load cards initially
    fetch("/api/cards")
      .then((res) => res.json())
      .then((data) => setAllCards(data));

    // Socket Listeners
    socket.on("room-created", (code: string) => {
      setRoomCode(code);
      setIsCreator(true);
      setGameState("LOBBY");
      setPlayerCount(1);
      // Update URL without reload to make it shareable
      window.history.replaceState(null, "", `?room=${code}`);
    });

    socket.on("player-joined", ({ playerCount }: { playerCount: number }) => {
      setPlayerCount(playerCount);
    });

    socket.on("error", (msg: string) => {
      setError(msg);
      setTimeout(() => setError(""), 3000);
    });

    socket.on("game-started", ({ target, board }: { target: string, board: string[] }) => {
      console.log("Game started! Target:", target, "Board length:", board?.length);
      setTargetCard(target);
      // If server sent a board, use it. Otherwise fallback to all (shouldn't happen with new server logic)
      if (board) setBoardCards(board);
      setGameState("PLAYING");
      // Reset local board
      setEliminatedCards(new Set());
    });

    return () => {
      socket.off("room-created");
      socket.off("player-joined");
      socket.off("error");
      socket.off("game-started");
    };
  }, []);

  const createRoom = () => socket.emit("create-room");

  const joinRoom = () => {
    const codeToJoin = inputCode ? inputCode.toUpperCase() : "";
    if (!codeToJoin) return;
    
    socket.emit("join-room", codeToJoin);
    setRoomCode(codeToJoin);
    setGameState("LOBBY");
  };

  const startGame = () => {
    socket.emit("start-game", { roomId: roomCode, allCards });
  };

  const toggleCard = (card: string) => {
    const newEliminated = new Set(eliminatedCards);
    if (newEliminated.has(card)) {
      newEliminated.delete(card);
    } else {
      newEliminated.add(card);
    }
    setEliminatedCards(newEliminated);
  };

  // --- RENDERERS ---

  if (gameState === "MENU") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700">
          <h1 className="text-4xl font-bold text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Kart Bul
          </h1>
          
          <div className="space-y-6">
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
          <div className="text-6xl font-mono font-black text-blue-400 my-8 tracking-[0.5em] pl-4">
            {roomCode}
          </div>
          
          <div className="bg-slate-700/50 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className={`w-3 h-3 rounded-full ${playerCount >= 1 ? 'bg-green-500' : 'bg-slate-500'}`} />
              <div className={`w-3 h-3 rounded-full ${playerCount >= 2 ? 'bg-green-500' : 'bg-slate-500'}`} />
            </div>
            <p className="text-slate-300">
              {playerCount === 1 ? "Rakip bekleniyor..." : "Rakip hazır!"}
            </p>
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
    <div className="min-h-screen bg-slate-900 p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 bg-slate-800/80 backdrop-blur rounded-2xl p-4 border border-slate-700 shadow-lg z-10 sticky top-4">
        <div className="flex items-center gap-4">
           {targetCard && (
            <div className={`relative transition-all duration-500 ${isTargetRevealed ? 'w-24' : 'w-16 h-20 bg-slate-700 rounded-lg flex items-center justify-center'}`}>
               {isTargetRevealed ? (
                   <div 
                      className="cursor-pointer"
                      onClick={() => setIsTargetRevealed(false)}
                   >
                     <p className="text-xs text-center text-slate-400 mb-1">SEN:</p>
                     <Image 
                       src={`/clash-royale-cards/${targetCard}`}
                       width={100}
                       height={120}
                       alt="Target"
                       className="rounded-lg shadow-md border-2 border-amber-400"
                     />
                   </div>
               ) : (
                   <button 
                     onClick={() => setIsTargetRevealed(true)}
                     className="text-2xl"
                   >
                     👁️
                   </button>
               )}
            </div>
           )}
           <div className="flex flex-col">
              <h1 className="text-xl font-bold text-white">Kart Bul</h1>
              <p className="text-slate-400 text-sm">Sıra sende mi? Kartları ele!</p>
           </div>
        </div>

        <div className="flex gap-2">
           <button 
             className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
             onClick={() => setEliminatedCards(new Set())}
           >
             Tümünü Aç
           </button>
        </div>
      </div>

      {/* Grid - 6x6 Layout */}
      <div className="flex justify-center pb-20">
         {gameState === "PLAYING" && boardCards.length === 0 ? (
             <div className="text-center text-slate-400 mt-10">
                 <p className="text-xl mb-4">Kartlar yükleniyor veya bir hata oluştu.</p>
                 <p className="text-sm">Lütfen terminali kapatıp <code>npm run dev</code> komutunu yeniden başlatın.</p>
             </div>
         ) : (
         <div className="grid grid-cols-6 gap-3 max-w-5xl w-full">
            {boardCards.map((card) => {
              const isEliminated = eliminatedCards.has(card);
              return (
                <div
                  key={card}
                  onClick={() => toggleCard(card)}
                  className={`
                    relative aspect-[3/4] cursor-pointer transition-all duration-300 transform rounded-xl overflow-hidden border-2 border-slate-700
                    ${isEliminated ? 'scale-95 opacity-50 grayscale border-red-900/50' : 'hover:scale-105 shadow-xl hover:shadow-2xl hover:z-10 hover:border-blue-400'}
                  `}
                >
                  <div className="absolute inset-0 bg-slate-800">
                    <Image
                      src={`/clash-royale-cards/${card}`}
                      fill
                      sizes="(max-width: 768px) 16vw, 150px"
                      className="object-cover"
                      alt={card.replace('.png', '')}
                    />
                  </div>
                  
                  {/* Overlay for eliminated */}
                  {isEliminated && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center animate-in fade-in duration-200">
                       <div className="text-red-500 font-bold text-6xl select-none">
                         ✕
                       </div>
                    </div>
                  )}
                </div>
              );
            })}
         </div>
         )}
      </div>
    </div>
  );
}

export default function KartBulPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Yükleniyor...</div>}>
            <GameContent />
        </Suspense>
    )
}
