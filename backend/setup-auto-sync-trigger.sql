-- Create a function that syncs users table when honey_points changes
CREATE OR REPLACE FUNCTION sync_honey_points_to_users()
RETURNS TRIGGER AS $$
BEGIN
  -- Update users table with new honey points value
  UPDATE users
  SET total_points = ROUND(NEW.total_points)
  WHERE wallet_address = NEW.wallet_address;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires after INSERT or UPDATE on honey_points
DROP TRIGGER IF EXISTS honey_points_sync_trigger ON honey_points;

CREATE TRIGGER honey_points_sync_trigger
AFTER INSERT OR UPDATE OF total_points ON honey_points
FOR EACH ROW
EXECUTE FUNCTION sync_honey_points_to_users();

-- Test: This should automatically update users table
-- UPDATE honey_points SET total_points = total_points WHERE wallet_address = 'rKkkYMCvC63HEgxjQHmayKADaxYqnsMUkT';
