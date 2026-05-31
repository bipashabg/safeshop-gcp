import express from "express";
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());
const port = process.env.PORT || 8080;

const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function connect() {
  await client.connect();
  db = client.db("safeshop");
  console.log("Connected to MongoDB");
}

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// MCP-style endpoints the agent can call
app.post("/mcp/sellers/save", async (req, res) => {
  try {
    const result = await db.collection("sellers").insertOne({
      ...req.body,
      savedAt: new Date()
    });
    res.json({ success: true, id: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/mcp/sellers/find", async (req, res) => {
  try {
    const { domain } = req.body;
    const seller = await db.collection("sellers").findOne({ domain });
    res.json({ found: !!seller, data: seller });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/mcp/reports/save", async (req, res) => {
  try {
    const result = await db.collection("user_reports").insertOne({
      ...req.body,
      reportedAt: new Date()
    });
    res.json({ success: true, id: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/mcp/reports/find", async (req, res) => {
  try {
    const { domain } = req.body;
    const reports = await db.collection("user_reports")
      .find({ domain })
      .toArray();
    res.json({ count: reports.length, reports });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

connect().then(() => {
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}).catch(err => {
  console.error("MongoDB connection failed:", err);
  process.exit(1);
});
