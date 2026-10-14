-- Migration: 20261014120000_backfill_streams_published_at.sql
-- Description: Backfill published_at timestamps for existing livestreams that had NULL published_at

UPDATE streams AS s
SET published_at = v.published_at::timestamptz
FROM (VALUES
  ('9en8rDtKmWM', '2026-10-01T15:25:10Z'),
  ('s0BYLmEaPMo', '2026-09-30T16:15:40Z'),
  ('BfhSqJYq4b8', '2026-09-29T15:40:12Z'),
  ('6fEs8zfUijw', '2026-09-26T15:53:34Z'),
  ('Ovp27hmB_lE', '2026-09-26T12:02:17Z'),
  ('z_fx7Xcai0g', '2026-09-27T09:57:07Z'),
  ('XEtkxYOvnHo', '2026-10-02T12:40:24Z'),
  ('m0JoXQd2qOs', '2026-10-05T13:54:12Z'),
  ('zIm-TtziLdI', '2026-10-09T13:03:08Z'),
  ('5dVk6xQWzYw', '2026-09-23T15:46:36Z'),
  ('7JWtoplWpac', '2026-09-24T10:51:35Z'),
  ('5tWItJi_duM', '2026-09-21T13:06:46Z'),
  ('QNdzcRWhth8', '2026-10-12T07:40:27Z'),
  ('HIomVSXLjmc', '2026-10-10T11:17:30Z'),
  ('Mc36EJ_F_Lw', '2026-10-08T18:45:57Z'),
  ('pNNJWLPvohU', '2026-10-08T06:27:13Z'),
  ('_iKwG5AoAzg', '2026-09-28T14:10:54Z'),
  ('_FxOg7OXyqI', '2026-10-02T09:43:42Z'),
  ('Y8m5BApcaUE', '2026-10-01T10:23:27Z'),
  ('ZNkrcpQfQv0', '2026-09-30T09:54:21Z'),
  ('C4H5LaRIMkU', '2026-09-29T08:36:42Z'),
  ('C69rR9jkL4I', '2026-10-11T18:26:39Z'),
  ('j5BxaCAWmEQ', '2026-10-12T15:18:55Z')
) AS v(video_id, published_at)
WHERE s.video_id = v.video_id
  AND s.published_at IS NULL;
