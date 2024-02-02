const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const http = require("http");
const serverio = require("socket.io");
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["https://swiftchatx.netlify.app", "http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

const server = http.createServer(app);
const io = serverio(server, {
  allowEIO3: true,
  cors: {
    origin: ["https://swiftchatx.netlify.app", "http://localhost:5173"],
    credentials: true,
  },
});

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.usgumga.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const db = client.db("swiftChatDb");
    const conversationsCollection = db.collection("conversations");
    const userCollection = db.collection("users");

    io.on("connection", (socket) => {
      socket.on("joinRoom", (roomId) => {
        socket.join(roomId);
        socket.room = roomId;
      });

      // Send a message
      socket.on("sendMessage", (data) => {
        socket.to(socket.room).emit("message", data);
      });

      // Handle typing events
      socket.on("typing", (data) => {
        const typingData = { ...data, room: socket.room };
        // Broadcast the typing notification to everyone in the room except the sender
        socket.to(socket.room).emit("typingNotify", typingData);
      });

      socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
        socket.leaveAll();
      });
    });

    // Storing messages to mongodb
    app.post("/api/v1/save-message", async (req, res) => {
      const data = req.body;
      const conversationId = createConversationId(
        data.senderEmail,
        data.receiverEmail
      );
      const result = await conversationsCollection.updateOne(
        { _id: conversationId },
        { $push: { messages: data } },
        { upsert: true }
      );
      res.send(result);
    });

    const createConversationId = (user1, user2) => {
      const sortedEmails = [user1, user2].sort();
      return sortedEmails.join("-");
    };

    // Get messages for two users conversation
    app.get("/api/v1/get-messages", async (req, res) => {
      const searchingID = req.query?.id;
      const query = { _id: searchingID };
      const result = await conversationsCollection.find(query).toArray();
      res.send(result);
    });

    // get user by searching
    app.get("/api/v1/user", async (req, res) => {
      const searchQuery = req.query?.name;
      let filter;
      if (searchQuery) {
        filter = {
          name: { $regex: new RegExp(searchQuery, "i") },
        };
      }
      const options = {
        projection: { password: 0 },
      };
      const result = await userCollection.find(filter, options).toArray();
      res.send(result);
    });

    // api for getting user from db
    app.get("/api/v1/get-user", async (req, res) => {
      const options = {
        projection: { password: 0 },
      };
      const result = await userCollection.find({}, options).toArray();
      res.send(result);
    });

    // api for creating user on db
    app.post("/api/v1/create-user", async (req, res) => {
      const user = req.body;
      const isExist = await userCollection.findOne({ email: user?.email });
      if (isExist) {
        return res.send("exist");
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/", (req, res) => {
      res.send("SwiftChat server running...");
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

server.listen(port, () => {
  console.log(`SwiftChat server is running on port : ${port}`);
});
