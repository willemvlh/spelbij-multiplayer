import socketIO, { Server, Socket } from "socket.io";
import http from "https"
import fs from "fs"

const server = http.createServer({
  key: fs.readFileSync("./private.key"),
  cert: fs.readFileSync("./cert.crt")
}, (req, res) => res.end())

const io = new Server(server, {
  cors: {
    methods: "*",
    origin: "*",
  },
});

type Game = {
  players: { name: string; score: number }[];
  foundWords: string[];
  words: string[];
  edgeLetters: string[];
  centerLetter: string;
};

const newGameForPlayer: (
  playerId: string,
  edgeLetters: string[],
  words: string[],
  centerLetter: string,
  foundWords: string[],
  score: number
) => Game = (playerId, edgeLetters, words, centerLetter, foundWords, score) => {
  return {
    players: [{ name: playerId, score: score }],
    words: words,
    foundWords: foundWords,
    edgeLetters: edgeLetters,
    centerLetter: centerLetter,
  };
};

const games: Map<string, Game> = new Map(); //purely used for newcomers

type PlayerState = {
  name: string;
  score: number;
  previousScore: number;
};

const getGame = (id: string) => games.get(id)!;

const onJoinRoom = (roomId: string, playerId: string) => {
  games.get(roomId)?.players.push({ name: playerId, score: 0 });
};

const updatePlayersInRoom = (roomId: string) => {
  io.to(roomId).emit("information", roomId, getGame(roomId));
};

const connect = (socket: Socket) => {
  console.log(`New connection: ${socket.id}`);
  socket.emit("identification", socket.id);
  socket.on(
    "createGame",
    (
      edgeLetters: string[],
      centerLetter: string,
      words: string[],
      foundWords: [],
      score: number
    ) => {
      games.set(
        socket.id,
        newGameForPlayer(
          socket.id,
          edgeLetters,
          words,
          centerLetter,
          foundWords,
          score
        )
      );
      socket.join(socket.id);
      socket.emit("gameCreated", socket.id);
      updatePlayersInRoom(socket.id);
    }
  );

  socket.on("joinGame", (gameId) => {
    console.log(`${socket.id} joins ${gameId}`);
    socket.join(gameId);
    updatePlayersInRoom(gameId);
  });

  socket.on(
    "gameUpdate", //emit a found word and added score for a certain player. Not broadcasted to sender!
    (gameId: string, word: string, playerState: PlayerState) => {
      let game = getGame(gameId);
      game.foundWords.push(word);
      let player = game.players.find((pl) => pl.name === playerState.name);
      if (!player) {
        console.log(`Could not find player ${playerState.name}`);
        console.log(game);
      } else {
        player.score = playerState.score;
      }
      updatePlayersInRoom(gameId);
    }
  );

  socket.on("disconnect", (reason) => {
    console.log(`${socket.id} left the room (${reason})`);
  });
};

io.sockets.adapter.on("join-room", (roomId, playerId) =>
  onJoinRoom(roomId, playerId)
);
io.sockets.adapter.on("leave-room", (roomId, playerId) => {
  let game = games.get(roomId);
  if (!game) {
    console.log("No such game...")
  }
  else {
    game.players = game.players.filter(pl => pl.name !== playerId);
    updatePlayersInRoom(roomId);
  }
})

io.on("connection", connect);
server.listen(80);
