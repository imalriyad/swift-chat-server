const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const http = require("http");
const serverio = require("socket.io");
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = serverio(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
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
      socket.on("connection", (userName) => {
        socket.broadcast.emit(
          "connection",
          `${userName?.name} has joined the chat`
        );
      });

      socket.on("sendMessage", (data) => {
        socket.broadcast.emit("message", data);

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
      });

      const createConversationId = (user1, user2) => {
        const sortedEmails = [user1, user2].sort();
        return sortedEmails.join("-");
      };

      socket.on("disconnect", () => {
        console.log("A user disconnected");
      });

      socket.on("typing", (data) => {
        socket.broadcast.emit("typing", data);
      });
    });

    // Get messages for two users conversation
    app.get("/api/v1/get-messages", async (req, res) => {
      const searchingID = req?.query?.id;
      console.log(searchingID);
      const query = { _id: searchingID };
      const result = await conversationsCollection.find(query).toArray();
      res.send(result);
    });

    // api for getting user from db
    app.get("/api/v1/get-user", async (req, res) => {
      const result = await userCollection.find().toArray();
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
