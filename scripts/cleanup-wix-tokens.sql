-- Cleanup duplicate wix_tokens entries
-- Keep only the most recent record per site_id

-- First, show what will be deleted
SELECT 'Records to delete:' as info;
SELECT id, site_id, updated_at
FROM wix_tokens w1
WHERE site_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM wix_tokens w2
    WHERE w2.site_id = w1.site_id
      AND w2.id != w1.id
      AND (w2.updated_at > w1.updated_at OR (w2.updated_at = w1.updated_at AND w2.id > w1.id))
  );

-- Delete duplicates, keeping only the most recent per site_id
DELETE FROM wix_tokens w1
WHERE site_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM wix_tokens w2
    WHERE w2.site_id = w1.site_id
      AND w2.id != w1.id
      AND (w2.updated_at > w1.updated_at OR (w2.updated_at = w1.updated_at AND w2.id > w1.id))
  );

-- Create unique index on site_id (if not exists)
DROP INDEX IF EXISTS wix_tokens_site_id_unique;
CREATE UNIQUE INDEX wix_tokens_site_id_unique ON wix_tokens (site_id) WHERE site_id IS NOT NULL;

-- Verify
SELECT 'Remaining records:' as info;
SELECT id, site_id, updated_at FROM wix_tokens WHERE site_id IS NOT NULL ORDER BY site_id;
