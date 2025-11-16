# BEARpark Cosmetics System Integration Guide

## Overview
This guide explains how to integrate the cosmetics system (profile rings & banners) into the main BEARpark website.

## Files Created

### Backend Files
1. **`backend/supabase-cosmetics-setup.sql`** - Database schema
   - Run this SQL file in your Supabase database to create the necessary tables

### API Endpoints
2. **`api/cosmetics/catalog.js`** - Get all available cosmetics
3. **`api/cosmetics/inventory/[wallet].js`** - Get user's owned cosmetics
4. **`api/cosmetics/purchase.js`** - Purchase a cosmetic with honey points
5. **`api/cosmetics/equip.js`** - Equip/unequip a cosmetic
6. **`api/cosmetics/equipped/[wallet].js`** - Get user's currently equipped items

### Frontend Files
7. **`cosmetics-system.js`** - Core cosmetics system JavaScript
8. **`store-modal.html`** - Store UI for purchasing cosmetics
9. **`inventory-modal.html`** - Inventory UI for managing owned cosmetics

### Assets
10. **`cosmetics/`** directory - Contains all ring and banner SVG files:
    - Rings: `purple-ring.svg`, `green-ring.svg`, `yellow-ring.svg`, `tricolor-ring.svg`, `animated-tricolor-ring.svg`
    - Banners: `banner-honeycomb.svg`, `banner-forest.svg`, `banner-geometric.svg`, `banner-starry.svg`, `banner-golden-honey.svg`

---

## Integration Steps

### Step 1: Run Database Migration

In your Supabase dashboard, execute the SQL file:

```sql
-- Run: backend/supabase-cosmetics-setup.sql
```

This creates:
- `cosmetics_catalog` table
- `user_cosmetics` table
- `cosmetics_transactions` table
- Adds `equipped_ring_id` and `equipped_banner_id` columns to `profiles` table

---

### Step 2: Include Cosmetics System in main.html

Add these lines in the `<head>` section of `main.html`:

```html
<!-- Cosmetics System -->
<script src="cosmetics-system.js"></script>
```

Add these lines before the closing `</body>` tag in `main.html`:

```html
<!-- Include Store and Inventory Modals -->
<script>
  // Load external modal HTML files
  fetch('store-modal.html')
    .then(response => response.text())
    .then(html => {
      const div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div);
    });

  fetch('inventory-modal.html')
    .then(response => response.text())
    .then(html => {
      const div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div);
    });
</script>
```

---

### Step 3: Add Navigation Buttons

Find your navigation menu in `main.html` and add these buttons:

```html
<!-- Add next to the existing Honey Points or Bear Hub buttons -->
<button onclick="openStoreModal()" style="padding: 12px 24px; font-size: 16px; font-weight: 900; background: var(--gold); color: #000; border: none; border-radius: 12px; cursor: pointer;">
  🍯 Store
</button>

<button onclick="openInventoryModal()" style="padding: 12px 24px; font-size: 16px; font-weight: 900; background: #07ae08; color: #fff; border: none; border-radius: 12px; cursor: pointer;">
  🎒 Inventory
</button>
```

---

### Step 4: Remove Default Profile Picture Borders

Find these CSS classes in `main.html` and update them:

#### For Profile Modal Pictures (around line 2363)

**BEFORE:**
```css
.profile-picture,
.profile-picture-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 6px solid transparent;
  background-image: linear-gradient(#141619, #141619), var(--tri-gradient);
  background-origin: padding-box, border-box;
  background-clip: padding-box, border-box;
  object-fit: cover;
}
```

**AFTER:**
```css
.profile-picture,
.profile-picture-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: none; /* REMOVED DEFAULT BORDER */
  background: #141619; /* SIMPLE BACKGROUND */
  object-fit: cover;
}
```

#### For Bear Hub Avatars (around line 1840)

**BEFORE:**
```css
.bear-user-avatar-border {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: linear-gradient(45deg,
    #9333ea 0%,
    #edb723 33%,
    #22c55e 66%,
    #9333ea 100%);
  background-size: 300% 300%;
  animation: rainbowRotate 3s linear infinite;
}
```

**AFTER:**
```css
.bear-user-avatar-border {
  /* REMOVED - Now cosmetic rings will replace this */
  display: none;
}
```

#### For Community User Avatars (around line 2118)

**BEFORE:**
```css
.community-user-avatar,
.community-user-avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 3px solid var(--gold); /* Or whatever border is there */
  object-fit: cover;
}
```

**AFTER:**
```css
.community-user-avatar,
.community-user-avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: none; /* REMOVED DEFAULT BORDER */
  object-fit: cover;
}
```

---

### Step 5: Apply Cosmetics to Profile Displays

Find the JavaScript function that loads user profiles (likely `loadUserProfile()` or `showProfileModal()`).

Add this code to apply cosmetics when a profile is displayed:

```javascript
async function showProfileModal(walletAddress) {
  // ... existing profile loading code ...

  // Apply cosmetics to the profile
  const profileContainer = document.querySelector('.profile-modal-content');
  const avatarContainer = document.querySelector('.profile-picture-container');

  await window.cosmeticsSystem.applyCosmeticsToProfile(
    walletAddress,
    avatarContainer,
    profileContainer
  );
}
```

---

### Step 6: Apply Cosmetics to Bear Hub & Community Lists

Find where Bear Hub users are rendered and add cosmetic ring support:

```javascript
// Example for Bear Hub user cards
async function renderBearHubUsers(users) {
  for (const user of users) {
    // ... existing rendering code ...

    // After avatar is added to DOM
    const avatarContainer = document.querySelector(`[data-wallet="${user.wallet}"] .bear-user-avatar-container`);
    const equipped = await window.cosmeticsSystem.fetchEquippedCosmetics(user.wallet);

    if (equipped.ring) {
      window.cosmeticsSystem.renderProfileRing(avatarContainer, equipped.ring);
    }
  }
}
```

---

### Step 7: Update Profile Picture Upload

When users upload new profile pictures, ensure cosmetics are re-applied:

```javascript
async function updateProfilePicture(newImageUrl) {
  // ... existing update code ...

  // Re-apply cosmetics after image change
  const wallet = localStorage.getItem('xaman_account');
  const avatarContainer = document.querySelector('.profile-picture-container');
  const equipped = await window.cosmeticsSystem.fetchEquippedCosmetics(wallet);

  if (equipped.ring) {
    window.cosmeticsSystem.renderProfileRing(avatarContainer, equipped.ring);
  }
}
```

---

## Honey Points Pricing

As configured in the SQL setup:

### Profile Rings
- **Purple Ring**: 150 HP (Common) - ~2-3 days
- **Green Ring**: 150 HP (Common) - ~2-3 days
- **Yellow Ring**: 150 HP (Common) - ~2-3 days
- **Tri-Color Ring**: 400 HP (Rare) - ~6 days
- **Animated Tri-Color Ring**: 800 HP (Legendary) - ~12 days

### Profile Banners
- **Honeycomb Banner**: 200 HP (Common) - ~3 days
- **Forest Banner**: 200 HP (Common) - ~3 days
- **Abstract Geometric Banner**: 200 HP (Common) - ~3 days
- **Starry Night Banner**: 500 HP (Epic) - ~7-8 days
- **Golden Honey Banner**: 500 HP (Epic) - ~7-8 days

---

## Testing Checklist

- [ ] Database tables created successfully
- [ ] API endpoints respond correctly
- [ ] Store modal opens and displays items
- [ ] Can purchase items with honey points
- [ ] Inventory modal shows owned items
- [ ] Can equip/unequip rings and banners
- [ ] Rings display correctly around all profile pictures
- [ ] Banners display correctly in profile modals
- [ ] Default borders removed from all avatars
- [ ] Cosmetics persist across page reloads

---

## Troubleshooting

### Issue: "Cosmetic images not loading"
**Solution**: Ensure the `/cosmetics/` directory is in your web root and accessible

### Issue: "Purchase fails with 'Insufficient honey points'"
**Solution**: Check that the `honey_points` table has correct balance for the user

### Issue: "Rings not appearing on avatars"
**Solution**: Make sure `applyCosmeticsToProfile()` is called after the avatar element is in the DOM

### Issue: "Database error when equipping"
**Solution**: Verify the `profiles` table has the `equipped_ring_id` and `equipped_banner_id` columns

---

## Next Steps

1. Run the database migration
2. Integrate the modals into main.html
3. Remove default borders
4. Add navigation buttons
5. Test purchasing flow
6. Test equipping/unequipping
7. Replace placeholder banners with custom designs

---

## Future Enhancements

- Add more ring designs (rainbow, animated patterns, etc.)
- Create seasonal/limited edition cosmetics
- Add profile frames (around entire profile, not just picture)
- Add achievement badges
- Create cosmetic bundles
- Add trading/gifting system
