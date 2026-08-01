import { pgTable, text, integer, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  chips: integer("chips").notNull().default(5000),
  handsPlayed: integer("hands_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  totalWon: integer("total_won").notNull().default(0),
  totalStaked: integer("total_staked").notNull().default(0),
  netPnL: integer("net_pnl").notNull().default(0),
  lastActiveAt: timestamp("last_active_at"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  balanceBefore: integer("balance_before").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  tableId: text("table_id"),
  handId: text("hand_id"),
  adminId: text("admin_id"),
  note: text("note"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const hands = pgTable("hands", {
  id: text("id").primaryKey(),
  tableId: text("table_id").notNull(),
  pot: integer("pot").notNull(),
  winnerUserId: text("winner_user_id"),
  winnerSeat: integer("winner_seat"),
  players: jsonb("players").notNull().default([]),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at").notNull().defaultNow(),
});

export const friendships = pgTable("friendships", {
  userA: text("user_a").notNull().references(() => users.id),
  userB: text("user_b").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userA, table.userB] })]);

export const friendRequests = pgTable("friend_requests", {
  id: text("id").primaryKey(),
  fromUserId: text("from_user_id").notNull().references(() => users.id),
  toUserId: text("to_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const admins = pgTable("admins", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adminLogs = pgTable("admin_logs", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  adminUsername: text("admin_username").notNull(),
  action: text("action").notNull(),
  targetId: text("target_id"),
  targetUsername: text("target_username"),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});
