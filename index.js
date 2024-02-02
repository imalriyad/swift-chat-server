const express = require("express");
const app = express();
require("dotenv").config();
var jwt = require("jsonwebtoken");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const serverio = require("socket.io");
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const server = http.createServer(app);
const io = serverio(server, {
  allowEIO3: true,
  cors: {
    origin: "http://localhost:5173",
    credentials: true, // Allow credentials (cookies)
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

// middlware for securing api's
const verifyUser = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.status(401).send({ message: "Unauthorized" });
    }
    
    req.user = decoded;
    next();
  });
};

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
        { _id: conversationId, userEmail: data.senderEmail },
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
    app.get("/api/v1/get-messages", verifyUser, async (req, res) => {
      const searchingID = req.query?.id;
      const userEmail = req.user.email;
      const query = { _id: searchingID, userEmail };
      const result = await conversationsCollection.find(query).toArray();
      res.send(result);
    });

    // creating jwt token on login
    app.post("/api/v1/jwt-token", (req, res) => {
      const userEmail = req?.body?.email;
      const token = jwt.sign({ email: userEmail }, process.env.JWT_SECRET, {
        expiresIn: "30d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })

        .send({ success: true });
    });

    // Removing cookie when user logout
    app.post("/api/v1/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production" ? true : false,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ status: true });
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
