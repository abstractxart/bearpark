# 🏆 Tie Handling for Meme of the Week

## How Ties Are Handled

**All memes with the same vote count receive the SAME rank and SAME reward.**

This is the fairest approach - if multiple memes tie, they all deserve equal recognition and rewards.

---

## Examples

### Scenario 1: 2-Way Tie for 1st Place

**Votes:**
- Meme A: 10 votes
- Meme B: 10 votes
- Meme C: 8 votes

**Awards:**
- 🥇 Meme A: **Rank 1** → **+50 honey**
- 🥇 Meme B: **Rank 1** → **+50 honey**
- 🥉 Meme C: **Rank 3** → **+20 honey**

Note: Rank 2 is skipped because two memes tied for 1st.

---

### Scenario 2: 3-Way Tie for 1st Place

**Votes:**
- Meme A: 10 votes
- Meme B: 10 votes
- Meme C: 10 votes

**Awards:**
- 🥇 Meme A: **Rank 1** → **+50 honey**
- 🥇 Meme B: **Rank 1** → **+50 honey**
- 🥇 Meme C: **Rank 1** → **+50 honey**

Note: All three tied for 1st place. No one gets 2nd or 3rd place rewards.

---

### Scenario 3: 2-Way Tie for 2nd Place

**Votes:**
- Meme A: 10 votes
- Meme B: 8 votes
- Meme C: 8 votes

**Awards:**
- 🥇 Meme A: **Rank 1** → **+50 honey**
- 🥈 Meme B: **Rank 2** → **+35 honey**
- 🥈 Meme C: **Rank 2** → **+35 honey**

Note: Two memes tied for 2nd place. Both get 2nd place rewards.

---

### Scenario 4: 2-Way Tie for 3rd Place

**Votes:**
- Meme A: 10 votes
- Meme B: 8 votes
- Meme C: 5 votes
- Meme D: 5 votes

**Awards:**
- 🥇 Meme A: **Rank 1** → **+50 honey**
- 🥈 Meme B: **Rank 2** → **+35 honey**
- 🥉 Meme C: **Rank 3** → **+20 honey**
- 🥉 Meme D: **Rank 3** → **+20 honey**

Note: Two memes tied for 3rd place. Both get 3rd place rewards.

---

### Scenario 5: No Clear Winner (Everyone Ties)

**Votes:**
- Meme A: 5 votes
- Meme B: 5 votes
- Meme C: 5 votes
- Meme D: 5 votes

**Awards:**
- 🥇 Meme A: **Rank 1** → **+50 honey**
- 🥇 Meme B: **Rank 1** → **+50 honey**
- 🥇 Meme C: **Rank 1** → **+50 honey**
- 🥇 Meme D: **Rank 1** → **+50 honey**

Note: All memes tied with same votes. All get 1st place rewards.

---

### Scenario 6: Only 1 Meme Submitted

**Votes:**
- Meme A: 10 votes

**Awards:**
- 🥇 Meme A: **Rank 1** → **+50 honey**

Note: Even with only one submission, they still get 1st place reward.

---

### Scenario 7: No Memes Submitted

**Awards:**
- None

Note: If no memes were submitted, no rewards are given. The week resets normally.

---

## Algorithm Logic

```
position = 1 (position in sorted list)
rank = 1 (actual rank)
previousVotes = null

For each meme (sorted by votes, highest first):
  If votes changed from previous meme:
    rank = position

  If rank > 3:
    Stop (no more rewards)

  Award reward[rank]

  previousVotes = meme.votes
  position++
```

This ensures:
- Ties get the same rank
- Subsequent ranks skip appropriately
- Maximum fairness for all participants
