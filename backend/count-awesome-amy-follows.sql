-- Count AWESOME AMY's followers and following
-- Her wallet: rwx873kFLGWEcQiPTqiDGkrRo5YwcHvhUn

-- How many people is AWESOME AMY following?
SELECT COUNT(*) as awesome_amy_following
FROM follows
WHERE follower_wallet = 'rwx873kFLGWEcQiPTqiDGkrRo5YwcHvhUn';

-- How many followers does AWESOME AMY have?
SELECT COUNT(*) as awesome_amy_followers
FROM follows
WHERE following_wallet = 'rwx873kFLGWEcQiPTqiDGkrRo5YwcHvhUn';

-- Show who AWESOME AMY is following
SELECT following_wallet
FROM follows
WHERE follower_wallet = 'rwx873kFLGWEcQiPTqiDGkrRo5YwcHvhUn';

-- Show who is following AWESOME AMY
SELECT follower_wallet
FROM follows
WHERE following_wallet = 'rwx873kFLGWEcQiPTqiDGkrRo5YwcHvhUn';
