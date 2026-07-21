-- PK(card_id). Not merged: RefreshCardStatsFunction recomputes stats from
-- records every 5 minutes, so dropping the loser row is sufficient.
DELETE FROM card_stats WHERE card_id IN (350,351,352);
