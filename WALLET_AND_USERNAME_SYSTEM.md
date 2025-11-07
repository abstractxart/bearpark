# BEAR Park Wallet & Username System - Complete Technical Documentation

## Overview

BEAR Park implements a comprehensive wallet authentication and user profile system that integrates XRP Ledger (XRPL) wallets, Twitter OAuth, and user profiles with game leaderboards.

---

## 1. WALLET CONNECTION & AUTHENTICATION

### 1.1 Primary Authentication Flow

Location: main.html (lines 1749-1770)

Session Storage Keys:
- bearpark_auth - Boolean flag
- bearpark_wallet - Wallet address

Storage Method: Browser sessionStorage (not localStorage)

Authorization: Uses XAMAN (Xumm) API for XRP wallet signing
- Environment Variable: XAMAN_API_KEY and XAMAN_API_SECRET
- Endpoint: https://xumm.app/api/v1/platform

### 1.2 Wallet Authentication Endpoints

Backend: C:\Users\Oz\Desktop\BEARpark\backend\server.js (lines 52-104)

POST /api/xaman/payload
- Creates a XAMAN signing payload
- Returns: { uuid, next, refs }

GET /api/xaman/payload/:uuid
- Checks if user signed the payload
- Returns: { payload, meta, signed }

### 1.3 Wallet Display & Formatting

Function: formatWallet() in api/leaderboard.js (lines 62-66)
Example: rU2A....3ZQ7Jy

---

## 2. TWITTER INTEGRATION & AUTHENTICATION

### 2.1 Twitter OAuth 2.0 Flow

Location: api/auth/twitter.js

Step 1: Generate OAuth URL (GET Request)
GET /api/auth/twitter?wallet_address={wallet}

Parameters:
- wallet_address: User's XRPL wallet address

Response:
{
  "success": true,
  "auth_url": "https://twitter.com/i/oauth2/authorize?..."
}

Step 2: Handle OAuth Callback (POST Request)
POST /api/auth/twitter

Body:
{
  "code": "oauth_code_from_twitter",
  "state": "base64_encoded_state",
  "wallet_address": "user_wallet"
}

Response:
{
  "success": true,
  "message": "Twitter connected successfully",
  "user": {
    "wallet_address": "rU2A...",
    "twitter_username": "bearxrpl",
    "total_points": 1050,
    "claimed_points": 250
  }
}

Step 3: Disconnect Twitter (DELETE Request)
DELETE /api/auth/twitter

Body:
{
  "wallet_address": "user_wallet"
}

---

## 3. USERNAME STORAGE & RETRIEVAL

### 3.1 Username Sources (in order of priority)

1. Custom Display Name (from profiles table)
   - Set via profile editor in BEAR Park website
   - User-controlled custom username

2. Twitter Username (from users.twitter_username)
   - Auto-populated when Twitter connected
   - Example: @bearxrpl

3. Fallback: "Anonymous"
   - Used if no other data available

Code Example from main.html (line 2531-2532):
const displayName = entry.display_name || entry.twitter_username || 'Anonymous';

### 3.2 Username Display Locations

Frontend Storage:
- sessionStorage.getItem('bearpark_wallet')
- data.twitter_username
- data.display_name

Database Tables:

Users Table:
- twitter_username VARCHAR(50)

Profiles Table:
- display_name VARCHAR(100)
- avatar_nft TEXT

---

## 4. USER PROFILE MANAGEMENT

### 4.1 Profile API Endpoints

Backend: server.js (lines 110-175)

GET /api/profile/:wallet_address
POST /api/profile

Features:
1. Username Input - Max 20 characters
2. NFT Avatar Selector - BEAR NFTs display
3. Save Button - Calls POST /api/profile

---

## 5. EXISTING LEADERBOARD INTEGRATION

### 5.1 Main Website Leaderboards

Location: https://bearpark.xyz/#leaderboards
File: main.html (lines 1483-1568)

Games Tracked:
1. Flappy BEAR - game_id: flappy-bear
2. BEAR Slice - game_id: bear-slice
3. BEAR Jump Venture - game_id: bear-jumpventure

### 5.2 Standalone Leaderboard Page

Location: leaderboard.html
URL: https://bearpark.xyz/leaderboard.html

GET /api/leaderboard?limit=100

---

## 6. API ENDPOINTS SUMMARY

User & Profile Endpoints:
- GET /api/profile/:wallet_address
- POST /api/profile
- GET /api/points/:wallet
- GET /api/auth/twitter?wallet_address=:wallet
- POST /api/auth/twitter
- DELETE /api/auth/twitter

Game & Leaderboard Endpoints:
- GET /api/leaderboard?limit=100
- GET /api/leaderboard/:game_id?limit=10
- POST /api/leaderboard
- GET /api/leaderboard/:game_id/:wallet_address

Wallet Endpoints:
- POST /api/xaman/payload
- GET /api/xaman/payload/:uuid

---

## 7. GAME INTEGRATION LIBRARY

File: game-integration.js

Available Methods:
- BEARParkAPI.getWalletAddress()
- BEARParkAPI.getDisplayName()
- BEARParkAPI.isAuthenticated()
- BEARParkAPI.submitScore(score, metadata)
- BEARParkAPI.getLeaderboard(limit)
- BEARParkAPI.getMyScore()

Storage Keys (in localStorage):
- xaman_wallet_address
- display_name

Note: Games use localStorage while main site uses sessionStorage

---

## 8. KEY FILES REFERENCE

Frontend (Main Website):
- main.html - Primary interface
- leaderboard.html - Standalone leaderboard
- index.html - Home page

Backend API:
- server.js - Node/Express backend
- backend/server.js - Alternative backend

API Endpoints:
- api/auth/twitter.js - Twitter OAuth 2.0
- api/leaderboard.js - Points leaderboard
- api/points/[wallet].js - User points
- api/tweets/check.js - Tweet tracking

Database:
- supabase-schema.sql - Database schema

Game Integration:
- game-integration.js - Library for games
- game-integration-example.html - Example

Documentation:
- LEADERBOARD-SYSTEM-STATUS.md
- GAME-INTEGRATION-README.md
- SETUP_GUIDE.md

---

## 9. ENVIRONMENT VARIABLES REQUIRED

XAMAN (Wallet Connection):
- XAMAN_API_KEY
- XAMAN_API_SECRET

Twitter OAuth:
- TWITTER_CLIENT_ID
- TWITTER_CLIENT_SECRET
- TWITTER_BEARER_TOKEN

Supabase:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Server:
- PORT=3000
- FRONTEND_URL=https://bearpark.xyz

---

## 10. DATABASE SCHEMA

Users Table:
- id BIGSERIAL PRIMARY KEY
- wallet_address VARCHAR(50) UNIQUE
- twitter_username VARCHAR(50)
- twitter_user_id VARCHAR(50) UNIQUE
- twitter_access_token TEXT
- twitter_refresh_token TEXT
- total_points INTEGER DEFAULT 0
- created_at TIMESTAMP
- updated_at TIMESTAMP

Profiles Table:
- id BIGSERIAL PRIMARY KEY
- wallet_address VARCHAR(50) UNIQUE
- display_name VARCHAR(100)
- avatar_nft TEXT
- created_at TIMESTAMP
- updated_at TIMESTAMP

Game Leaderboards Table:
- id BIGSERIAL PRIMARY KEY
- wallet_address VARCHAR(50)
- game_id VARCHAR(100)
- score INTEGER
- metadata JSONB
- UNIQUE(wallet_address, game_id)

---

## Summary

BEAR Park implements a complete user identification system combining:

1. XRPL Wallet Authentication - Secure wallet signing via XAMAN
2. Twitter OAuth 2.0 - Social verification and activity tracking
3. Custom Profiles - User-controlled display names and NFT avatars
4. Points Leaderboards - Both points-based and game-score leaderboards
5. Game Integration - Unified scoring system across all games

All data is persisted in Supabase with proper security, caching, and fallback mechanisms.

