# 🔄 Automated Meme Week Reset

## ✅ FULLY AUTOMATED - No Manual Intervention Required

The meme week reset is now **100% automated** using Vercel Cron Jobs.

---

## 📅 When Does It Run?

**Every Sunday at 00:00 UTC (Midnight UTC)**

- Cron Schedule: `0 0 * * 0`
- Runs automatically via Vercel
- No need to manually trigger anything

---

## 🎯 What Happens During Reset?

### 1. **Check Week Status**
- Verifies current week has ended
- If not ended yet, skips reset

### 2. **Award Winners** 🏆
- **🥇 1st Place**: +50 honey points
- **🥈 2nd Place**: +35 honey points
- **🥉 3rd Place**: +20 honey points
- Points automatically added to user accounts

### 3. **Delete Old Memes** 🗑️
- All memes from ended week are **permanently deleted**
- Associated files removed from Supabase storage
- All votes for old memes also deleted (CASCADE)
- Frees up storage space

### 4. **Create New Week** 🆕
- New week automatically created (Sunday-Saturday)
- Fresh slate for new meme submissions
- Users can submit new memes immediately

---

## 💾 Data Retention

**Old memes are NOT kept** - they are permanently deleted after:
- Winners are awarded
- Files are removed from storage

This keeps your database clean and saves storage costs.

---

## 🔍 Monitoring

You can check if the cron job ran successfully:

1. **Vercel Dashboard**:
   - Go to your project → Deployments → Cron Jobs
   - View execution logs

2. **Manual Test**:
   - Open: `C:\Users\Oz\Desktop\BEARpark\backend\test-week-reset.html`
   - Manually trigger reset to verify it works

---

## ⚙️ Configuration

All settings are in:
- **Cron Schedule**: `backend/vercel.json` → `crons` section
- **Reset Logic**: `backend/server.js` → `/api/memes/reset-week`

### To Change Schedule:

Edit `backend/vercel.json`:
```json
"crons": [
  {
    "path": "/api/memes/reset-week",
    "schedule": "0 0 * * 0"  // Sunday midnight UTC
  }
]
```

**Cron Format**: `minute hour day-of-month month day-of-week`

Examples:
- `0 0 * * 0` = Every Sunday at midnight
- `0 0 * * 1` = Every Monday at midnight
- `0 12 * * 0` = Every Sunday at noon

---

## 🚨 Important Notes

1. **Time Zone**: Cron runs in **UTC** time
2. **Week Structure**: Weeks run Sunday-Saturday (reset at Sunday 00:00 UTC)
3. **Storage Cleanup**: Old files automatically deleted
4. **No History**: Old memes are not archived
5. **Winner Points**: Added before deletion occurs

---

## ✅ You're All Set!

The system is fully automated. Just sit back and let it run every Sunday at midnight.
