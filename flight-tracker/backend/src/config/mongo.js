import { MongoClient } from "mongodb";

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/flight_tracker_raw";

const client = new MongoClient(MONGO_URL);
let db = null;

export async function connectMongo() {
  if (db) return db;
  await client.connect();
  db = client.db();
  console.log("[mongo] connected");
  return db;
}

// Raw, unstructured scraper output (full page JSON blobs, HTML snapshots for
// debugging selector drift, etc). Keeping this separate from Postgres lets
// us reshape the scraper without migrations, while price_snapshots in
// Postgres stays the clean, queryable source of truth.
export async function rawScrapesCollection() {
  const database = await connectMongo();
  return database.collection("raw_scrapes");
}

export async function closeMongo() {
  await client.close();
  db = null;
}
