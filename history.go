package main

import (
	"database/sql"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type broadcast struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Artist    string `json:"artist"`
	StartedAt string `json:"startedAt"`
}

// Integer millisecond starts use the ceiling of each inclusive/exclusive time bound.
func historyBound(t time.Time) int64 {
	ms := t.UnixMilli()
	if t.Nanosecond()%int(time.Millisecond) != 0 {
		ms++
	}
	return ms
}

// Starts are confirmed by the audio engine. Reservations are never history.
func (c *controller) playbackHistory(w http.ResponseWriter, r *http.Request) {
	limit, beforeTime, beforeRow := 50, int64(math.MaxInt64), int64(math.MaxInt64)
	from, until := time.UnixMilli(0), time.Now().UTC()
	var err error
	q := r.URL.Query()
	if v := q.Get("limit"); v != "" {
		limit, err = strconv.Atoi(v)
	}
	if err != nil || limit < 1 || limit > 100 {
		http.Error(w, "invalid history query", 400)
		return
	}
	if v := q.Get("from"); v != "" {
		from, err = time.Parse(time.RFC3339Nano, v)
	}
	if err != nil || from.UnixMilli() < 0 {
		http.Error(w, "invalid history query", 400)
		return
	}
	if v := q.Get("until"); v != "" {
		until, err = time.Parse(time.RFC3339Nano, v)
	}
	if err != nil || !until.After(from) {
		http.Error(w, "invalid history query", 400)
		return
	}
	if v := q.Get("before"); v != "" {
		parts := strings.Split(v, ":")
		if len(parts) != 2 {
			http.Error(w, "invalid history query", 400)
			return
		}
		beforeTime, err = strconv.ParseInt(parts[0], 10, 64)
		if err == nil {
			beforeRow, err = strconv.ParseInt(parts[1], 10, 64)
		}
		if err != nil || beforeTime < 0 || beforeRow < 1 {
			http.Error(w, "invalid history query", 400)
			return
		}
	}
	result := struct {
		Stage string      `json:"stage"`
		From  string      `json:"from"`
		Until string      `json:"until"`
		Items []broadcast `json:"items"`
		Next  *string     `json:"next"`
	}{Stage: c.stage.ID, From: from.UTC().Format(time.RFC3339Nano), Until: until.UTC().Format(time.RFC3339Nano), Items: []broadcast{}}
	rows, err := c.db.QueryContext(r.Context(), `SELECT rowid,id,title,artist,started_at FROM playback
	 WHERE started_at>=? AND started_at<? AND (started_at,rowid)<(?,?)
	 ORDER BY started_at DESC,rowid DESC LIMIT ?`, historyBound(from), historyBound(until), beforeTime, beforeRow, limit+1)
	if err != nil {
		http.Error(w, "history unavailable", 503)
		return
	}
	defer rows.Close()
	var cursor string
	for rows.Next() {
		var item broadcast
		var row, at int64
		if err = rows.Scan(&row, &item.ID, &item.Title, &item.Artist, &at); err != nil {
			break
		}
		if len(result.Items) == limit {
			result.Next = &cursor
			break
		}
		item.ID, item.Title, item.Artist = validID(item.ID), c.cleanMetadata(item.Title), c.cleanMetadata(item.Artist)
		item.StartedAt = time.UnixMilli(at).UTC().Format(time.RFC3339Nano)
		result.Items = append(result.Items, item)
		cursor = strconv.FormatInt(at, 10) + ":" + strconv.FormatInt(row, 10)
	}
	closeErr := rows.Close()
	if err != nil || rows.Err() != nil || closeErr != nil {
		http.Error(w, "history unavailable", 503)
		return
	}
	jsonResponse(w, 200, result)
}

type playedCount struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Artist string `json:"artist"`
	Plays  int    `json:"plays"`
}

func (c *controller) musicStats(w http.ResponseWriter, r *http.Request) {
	until := time.Now().UTC()
	from := until.AddDate(0, 0, -30)
	result := struct {
		Stage          string        `json:"stage"`
		From           string        `json:"from"`
		Until          string        `json:"until"`
		Earliest       *string       `json:"earliest"`
		Tracks         int           `json:"tracks"`
		Plays          int           `json:"plays"`
		DistinctPlayed int           `json:"distinctPlayed"`
		Unplayed       int           `json:"unplayed"`
		Top            []playedCount `json:"top"`
	}{Stage: c.stage.ID, From: from.Format(time.RFC3339Nano), Until: until.Format(time.RFC3339Nano), Top: []playedCount{}}
	tx, err := c.db.BeginTx(r.Context(), &sql.TxOptions{ReadOnly: true})
	if err != nil {
		http.Error(w, "music statistics unavailable", 503)
		return
	}
	defer tx.Rollback()
	var earliest sql.NullInt64
	err = tx.QueryRowContext(r.Context(), `SELECT (SELECT COUNT(*) FROM tracks), MIN(started_at) FROM playback`).Scan(&result.Tracks, &earliest)
	if err == nil {
		err = tx.QueryRowContext(r.Context(), `SELECT COUNT(*),COUNT(DISTINCT id) FROM playback WHERE started_at>=? AND started_at<?`, historyBound(from), historyBound(until)).Scan(&result.Plays, &result.DistinctPlayed)
	}
	if err == nil {
		err = tx.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM tracks WHERE id NOT IN (SELECT id FROM playback WHERE started_at>=? AND started_at<?)`, historyBound(from), historyBound(until)).Scan(&result.Unplayed)
	}
	if err != nil {
		http.Error(w, "music statistics unavailable", 503)
		return
	}
	if earliest.Valid {
		value := time.UnixMilli(earliest.Int64).UTC().Format(time.RFC3339Nano)
		result.Earliest = &value
	}
	rows, err := tx.QueryContext(r.Context(), `SELECT id,title,artist,COUNT(*) FROM playback WHERE started_at>=? AND started_at<? GROUP BY id ORDER BY COUNT(*) DESC,id LIMIT 10`, historyBound(from), historyBound(until))
	if err != nil {
		http.Error(w, "music statistics unavailable", 503)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var item playedCount
		if err = rows.Scan(&item.ID, &item.Title, &item.Artist, &item.Plays); err != nil {
			break
		}
		item.ID, item.Title, item.Artist = validID(item.ID), c.cleanMetadata(item.Title), c.cleanMetadata(item.Artist)
		result.Top = append(result.Top, item)
	}
	closeErr := rows.Close()
	if err != nil || rows.Err() != nil || closeErr != nil {
		http.Error(w, "music statistics unavailable", 503)
		return
	}
	if err = tx.Commit(); err != nil {
		http.Error(w, "music statistics unavailable", 503)
		return
	}
	jsonResponse(w, 200, result)
}
