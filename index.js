const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const http = require('http');
const serverio = require('socket.io');
const port = process.env.PORT || 5000;

app.use(cors());

const server = http.createServer(app);
const io = serverio(server, {
    cors: {
        origin: "https://swiftchatx.netlify.app",
        methods: ["GET", "POST"]
    }
});


io.on("connection", (socket) => {
  socket.on("connection", (userName) => {
    console.log(userName?.name);
    socket.broadcast.emit(
      "connection",
      `${userName?.name} has joined the chat`
    );
  });

  socket.on("sendMsg", (data) => {
    console.log(data);
    socket.broadcast.emit("brodcast", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });

  socket.on("typing", (data) => {
    socket.broadcast.emit("typing", data);
  });
});

server.listen(port, () => {
  console.log(`SwiftChat server is running on port : ${port}`);
});
