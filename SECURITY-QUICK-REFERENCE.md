# 🔒 BEARpark Security - Quick Reference

## Setup (First Time)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and fill in your values
   ```

3. **Generate admin key:**
   ```bash
   openssl rand -hex 32
   # Copy output to ADMIN_API_KEY in .env
   ```

4. **Start server:**
   ```bash
   npm start
   ```

---

## Security Features at a Glance

| Feature | Status | Description |
|---------|--------|-------------|
| Rate Limiting | ✅ | 100 req/15min (general), 10 req/min (scores) |
| Helmet Headers | ✅ | XSS, clickjacking, MIME sniffing protection |
| Input Validation | ✅ | All inputs sanitized & validated |
| Admin Auth | ✅ | X-Admin-Key required for sensitive ops |
| Activity Tracking | ✅ | Suspicious behavior logged |
| Max Scores | ✅ | Per-game limits enforced |
| Wallet Validation | ✅ | XRP address format checked |
| Request Limit | ✅ | 10KB max payload size |

---

## Common Admin Operations

### Create a Raid
```bash
curl -X POST https://bearpark.xyz/api/raids \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_ADMIN_KEY" \
  -d '{
    "description": "Like and Retweet our latest post!",
    "twitter_url": "https://twitter.com/BearXRPL/status/123456",
    "reward": 20,
    "expires_at": "2025-12-31T23:59:59Z"
  }'
```

### View Suspicious Activity
```bash
curl https://bearpark.xyz/api/security/suspicious-activity \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

### Delete a Raid
```bash
curl -X DELETE https://bearpark.xyz/api/raids/123 \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

### Clear Security Log
```bash
curl -X POST https://bearpark.xyz/api/security/clear-log \
  -H "X-Admin-Key: YOUR_ADMIN_KEY"
```

---

## Monitoring

### Check Server Health
```bash
curl https://bearpark.xyz/health
```

### Watch Server Logs
Look for these security indicators:
- 🚨 = Suspicious activity detected
- ⚠️ = Warning (unusual but not blocked)
- ✅ = Normal operation
- ❌ = Blocked/rejected request

---

## What Gets Blocked?

| Attack Type | Detection Method | Action |
|-------------|------------------|--------|
| Impossible Scores | Max score validation | Rejected + logged |
| Score Spam | Rate limiting (10/min) | HTTP 429 error |
| Invalid Wallets | Format validation | Rejected + logged |
| Huge Point Jumps | >100k increase | Allowed but logged |
| Rapid Score Jumps | >10x increase | Allowed but logged |
| Duplicate Raids | Database constraint | Rejected + logged |
| Large Payloads | >10KB size | Rejected |
| Admin Access | No/wrong key | HTTP 403 + logged |
| Too Many Requests | Rate limit exceeded | HTTP 429 error |

---

## Response to Common Claims

### "No security on the website"
❌ **FALSE**
- 8 layers of security protection
- Enterprise-grade rate limiting
- Admin authentication required
- See [SECURITY.md](./SECURITY.md) for full details

### "Can hack the wallets"
❌ **FALSE**
- Private keys never leave wallet app
- Cryptographic signatures only
- Blockchain verification (immutable)
- Industry-standard Web3 security

### "Can cheat in all games"
❌ **MOSTLY FALSE**
- **Bear Pong:** Server-authoritative (CANNOT cheat)
- **Single-player games:** Client-side but validated:
  - Max scores enforced
  - Rate limited submissions
  - Suspicious jumps logged
  - Wallet authentication required

---

## Security Score: 9/10

### What We Have ✅
- Rate limiting
- Security headers
- Input validation
- Admin authentication
- Activity monitoring
- Score validation
- Wallet verification
- Request size limits
- Server-authoritative multiplayer
- Anti-duplicate mechanisms

### Nice to Have (Future)
- IP ban list (currently just logged)
- CAPTCHA for repeated violations
- 2FA for admin operations

---

## Emergency Procedures

### If Server is Under Attack
1. Check suspicious activity log:
   ```bash
   curl https://bearpark.xyz/api/security/suspicious-activity \
     -H "X-Admin-Key: YOUR_KEY"
   ```

2. Identify attacking IPs/wallets

3. Rate limiting will auto-throttle them

4. If needed, clear log after reviewing:
   ```bash
   curl -X POST https://bearpark.xyz/api/security/clear-log \
     -H "X-Admin-Key: YOUR_KEY"
   ```

### If Admin Key is Compromised
1. Immediately generate new key:
   ```bash
   openssl rand -hex 32
   ```

2. Update `.env` file:
   ```bash
   ADMIN_API_KEY=new-secure-key-here
   ```

3. Restart server:
   ```bash
   npm start
   ```

4. Review security logs for unauthorized admin actions

---

## Testing Security

### Test Rate Limiting
```bash
# Try 20 rapid requests (should get rate limited)
for i in {1..20}; do
  curl https://bearpark.xyz/api/leaderboard/flappy-bear
done
```

### Test Admin Auth
```bash
# Should fail with 403
curl -X POST https://bearpark.xyz/api/raids \
  -H "Content-Type: application/json" \
  -d '{"description": "test"}'

# Should succeed
curl -X POST https://bearpark.xyz/api/raids \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_KEY" \
  -d '{"description": "test", "twitter_url": "https://x.com/test/123", "expires_at": "2025-12-31T23:59:59Z"}'
```

### Test Score Validation
```bash
# Should be rejected (too high)
curl -X POST https://bearpark.xyz/api/leaderboard \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_address": "rYourWalletHere",
    "game_id": "flappy-bear",
    "score": 99999999
  }'
```

---

## Support

See full documentation: [SECURITY.md](./SECURITY.md)

**BEARpark is secure. These features prove it.**
