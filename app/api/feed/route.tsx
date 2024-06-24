import axios from "axios";
import Parser from "rss-parser";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const parser = new Parser();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

export async function GET(request: NextRequest) {
  let feedUrl = "https://feeds.bbci.co.uk/news/world/rss.xml"; // Default feed URL
  try {
    const client = await pool.connect();

    // Ensure the schema and tables exist, including the last_fetched column
    await client.query(`
      CREATE TABLE IF NOT EXISTS feeds (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        url TEXT NOT NULL,
        last_fetched TIMESTAMP DEFAULT NOW() - INTERVAL '1 day'
      );
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        link TEXT UNIQUE NOT NULL,
        publication_date TIMESTAMP NOT NULL,
        content TEXT NOT NULL,
        feed_id INTEGER REFERENCES feeds(id),
        last_checked TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Check if the feed URL exists and get the last fetched time
    const res = await client.query(
      "SELECT url, last_fetched FROM feeds WHERE name = $1",
      ["BBC World News"]
    );
    let shouldFetch = true;
    if (res.rows.length > 0) {
      feedUrl = res.rows[0].url;
      const lastFetched = res.rows[0].last_fetched;
      const diffMinutes =
        (new Date().getTime() - new Date(lastFetched).getTime()) / 60000;
      if (diffMinutes < 15) {
        shouldFetch = false; // Skip fetching if it's been less than 15 minutes
      }
    } else {
      // Insert the feed if it doesn't exist
      await client.query("INSERT INTO feeds(name, url) VALUES ($1, $2)", [
        "BBC World News",
        feedUrl,
      ]);
    }

    let response;
    if (shouldFetch) {
      // Fetch and parse the feed
      const feedResponse = await axios.get(feedUrl);
      const feedResponseParsed = await parser.parseString(feedResponse.data);

      // Insert or update articles
      for (const item of feedResponseParsed.items) {
        const { title, link, isoDate, content } = item;
        await client.query(
          `
          INSERT INTO articles (title, link, publication_date, content, feed_id)
          SELECT $1, $2, $3, $4, id FROM feeds WHERE name = 'BBC World News'
          ON CONFLICT (link) DO UPDATE 
          SET last_checked = NOW()
          WHERE EXCLUDED.publication_date > articles.publication_date;
        `,
          [title, link, isoDate, content]
        );
      }

      // Update the last fetched time
      await client.query(
        "UPDATE feeds SET last_fetched = NOW() WHERE name = $1",
        ["BBC World News"]
      );
    }

    response = await client.query(
      `
      SELECT title, link, content
      FROM articles
      WHERE feed_id = (SELECT id FROM feeds WHERE name = $1)
      ORDER BY publication_date DESC;
    `,
      ["BBC World News"]
    );

    client.release();
    return NextResponse.json(response.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch or update feed" });
  }
}
