-- Phase 7: conservatively backfill the contact relationship.
-- Legacy rows predate contact policies and have relationship = NULL; any other
-- unrecognised value is also coerced to 'UNKNOWN'. Combined with reply_mode's
-- existing 'OFF' default, this guarantees no historical contact silently gains AI
-- drafting permission. Users enable DRAFT per contact from the dashboard afterwards.
UPDATE `contacts`
SET `relationship` = 'UNKNOWN'
WHERE `relationship` IS NULL
   OR `relationship` NOT IN ('UNKNOWN', 'FAMILY', 'FRIEND', 'WORK', 'ACQUAINTANCE', 'OTHER');
