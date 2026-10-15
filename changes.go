package main

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"net/http"
	"strconv"
	"time"
)

// Changes describe committed playable selections, not historical Plex edit dates.
// The first successful sync establishes a baseline without inventing additions.
func recordCatalogueChanges(ctx context.Context, tx *sql.Tx, tracks []track, oldIDs map[string]bool) error {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := tx.ExecContext(ctx, "INSERT OR IGNORE INTO state(key,value) VALUES('changes_since',?)", now)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted > 0 {
		return err
	}
	incoming := make(map[string]bool, len(tracks))
	for _, t := range tracks {
		incoming[t.ID] = true
		if !oldIDs[t.ID] {
			if _, err := tx.ExecContext(ctx, "INSERT INTO catalogue_changes(kind,id,title,artist,album,observed_at) VALUES('added',?,?,?,?,?)", t.ID, t.Title, t.Artist, t.Details.Album, now); err != nil {
				return err
			}
		}
	}
	for id := range oldIDs {
		if incoming[id] {
			continue
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO catalogue_changes(kind,id,title,artist,album,observed_at)
   SELECT 'removed',t.id,t.title,t.artist,COALESCE(d.album,''),? FROM tracks t LEFT JOIN track_details d ON d.id=t.id WHERE t.id=?`, now, id); err != nil {
			return err
		}
	}
	return nil
}

type catalogueChange struct {
	Sequence   int64  `json:"sequence,string"`
	Kind       string `json:"kind"`
	ID         string `json:"id"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Album      string `json:"album"`
	ObservedAt string `json:"observedAt"`
}

type changesPage struct {
	TrackingSince *string           `json:"trackingSince"`
	Changes       []catalogueChange `json:"changes"`
	Next          *string           `json:"next"`
}

func (c *controller) catalogueChanges(w http.ResponseWriter, r *http.Request) {
	limit, before := 30, int64(math.MaxInt64)
	var err error
	if value := r.URL.Query().Get("limit"); value != "" {
		limit, err = strconv.Atoi(value)
	}
	if err != nil || limit < 1 || limit > 100 {
		http.Error(w, "invalid changes query", 400)
		return
	}
	if value := r.URL.Query().Get("before"); value != "" {
		before, err = strconv.ParseInt(value, 10, 64)
	}
	if err != nil || before < 1 {
		http.Error(w, "invalid changes query", 400)
		return
	}
	tx, err := c.db.BeginTx(r.Context(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		http.Error(w, "changes unavailable", 503)
		return
	}
	defer tx.Rollback()
	result := changesPage{Changes: []catalogueChange{}}
	var since string
	err = tx.QueryRowContext(r.Context(), "SELECT value FROM state WHERE key='changes_since'").Scan(&since)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		http.Error(w, "changes unavailable", 503)
		return
	}
	if err == nil {
		result.TrackingSince = &since
	}
	rows, err := tx.QueryContext(r.Context(), "SELECT sequence,kind,id,title,artist,album,observed_at FROM catalogue_changes WHERE sequence<? ORDER BY sequence DESC LIMIT ?", before, limit+1)
	if err != nil {
		http.Error(w, "changes unavailable", 503)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var change catalogueChange
		if err = rows.Scan(&change.Sequence, &change.Kind, &change.ID, &change.Title, &change.Artist, &change.Album, &change.ObservedAt); err != nil {
			break
		}
		change.Title = c.cleanMetadata(change.Title)
		change.Artist = c.cleanMetadata(change.Artist)
		change.Album = c.cleanMetadata(change.Album)
		result.Changes = append(result.Changes, change)
	}
	closeErr := rows.Close()
	if err != nil || rows.Err() != nil || closeErr != nil {
		http.Error(w, "changes unavailable", 503)
		return
	}
	if err = tx.Commit(); err != nil {
		http.Error(w, "changes unavailable", 503)
		return
	}
	if len(result.Changes) > limit {
		result.Changes = result.Changes[:limit]
		next := strconv.FormatInt(result.Changes[limit-1].Sequence, 10)
		result.Next = &next
	}
	jsonResponse(w, 200, result)
}
