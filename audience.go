package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func icecastListeners(body []byte, mount string) (*int, error) {
	var status struct {
		IceStats struct {
			Source json.RawMessage `json:"source"`
		} `json:"icestats"`
	}
	if err := json.Unmarshal(body, &status); err != nil {
		return nil, err
	}
	raw := status.IceStats.Source
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var sources []struct {
		ListenURL string `json:"listenurl"`
		Listeners *int   `json:"listeners"`
	}
	if len(raw) > 0 && raw[0] == '[' {
		if err := json.Unmarshal(raw, &sources); err != nil {
			return nil, err
		}
	} else {
		sources = append(sources, struct {
			ListenURL string `json:"listenurl"`
			Listeners *int   `json:"listeners"`
		}{})
		if err := json.Unmarshal(raw, &sources[0]); err != nil {
			return nil, err
		}
	}
	var found *int
	for _, source := range sources {
		u, err := url.Parse(source.ListenURL)
		if err != nil {
			return nil, err
		}
		if u.Path != mount {
			continue
		}
		if source.Listeners == nil || *source.Listeners < 0 || found != nil {
			return nil, errors.New("invalid audience count")
		}
		found = source.Listeners
	}
	return found, nil
}

func (c *controller) readIcecast(ctx context.Context) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(c.cfg.IcecastURL, "/")+"/status-json.xsl", nil)
	if err != nil {
		return nil, err
	}
	res, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, (1<<20)+1))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK || len(body) > 1<<20 {
		return nil, errors.New("invalid Icecast response")
	}
	return body, nil
}

func (c *controller) pollAudience(ctx context.Context, now time.Time) error {
	body, fetchErr := c.readIcecast(ctx)
	var listeners *int
	if fetchErr == nil {
		listeners, fetchErr = icecastListeners(body, "/"+c.stage.ID+".mp3")
	}
	if fetchErr != nil {
		listeners = nil
	}
	if err := c.recordAudience(ctx, now, listeners); err != nil {
		return err
	}
	return fetchErr
}

func (c *controller) recordAudience(ctx context.Context, now time.Time, listeners *int) error {
	if listeners != nil && *listeners < 0 {
		return errors.New("negative listeners")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var previousAt int64
	var previous sql.NullInt64
	err = tx.QueryRowContext(ctx, "SELECT at,listeners FROM samples ORDER BY at DESC LIMIT 1").Scan(&previousAt, &previous)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	at := now.UnixMilli()
	if err == nil && at <= previousAt {
		return errors.New("non-increasing sample time")
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO samples(at,listeners) VALUES(?,?)", at, listeners); err != nil {
		return err
	}
	if listeners != nil {
		if _, err = tx.ExecContext(ctx, `INSERT INTO daily(date,peak) VALUES(?,?) ON CONFLICT(date) DO UPDATE SET peak=MAX(peak,excluded.peak)`, now.UTC().Format("2006-01-02"), *listeners); err != nil {
			return err
		}
	}
	if listeners != nil && previous.Valid && at-previousAt <= 20000 && at > previousAt {
		start := time.UnixMilli(previousAt).UTC()
		end := now.UTC()
		interval := end.Sub(start).Seconds()
		for cursor := start; cursor.Before(end); {
			stop := time.Date(cursor.Year(), cursor.Month(), cursor.Day()+1, 0, 0, 0, 0, time.UTC)
			if stop.After(end) {
				stop = end
			}
			left := float64(previous.Int64) + float64(int64(*listeners)-previous.Int64)*cursor.Sub(start).Seconds()/interval
			right := float64(previous.Int64) + float64(int64(*listeners)-previous.Int64)*stop.Sub(start).Seconds()/interval
			seconds := stop.Sub(cursor).Seconds()
			peak := max(previous.Int64, int64(*listeners))
			_, err = tx.ExecContext(ctx, `INSERT INTO daily(date,peak,listener_seconds,measured_seconds) VALUES(?,?,?,?) ON CONFLICT(date) DO UPDATE SET listener_seconds=listener_seconds+excluded.listener_seconds,measured_seconds=measured_seconds+excluded.measured_seconds`, cursor.Format("2006-01-02"), peak, (left+right)/2*seconds, seconds)
			if err != nil {
				return err
			}
			cursor = stop
		}
	}
	return tx.Commit()
}

type audienceStatus struct {
	Listeners  *int    `json:"listeners"`
	MeasuredAt *string `json:"measuredAt"`
	Available  bool    `json:"available"`
}

func (c *controller) audience(ctx context.Context, now time.Time) (audienceStatus, error) {
	var result audienceStatus
	var at int64
	var n sql.NullInt64
	err := c.db.QueryRowContext(ctx, "SELECT at,listeners FROM samples ORDER BY at DESC LIMIT 1").Scan(&at, &n)
	if errors.Is(err, sql.ErrNoRows) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	stamp := time.UnixMilli(at).UTC().Format(time.RFC3339)
	result.MeasuredAt = &stamp
	if n.Valid && now.UnixMilli() >= at && now.Sub(time.UnixMilli(at)) <= 20*time.Second {
		listeners := int(n.Int64)
		result.Listeners = &listeners
		result.Available = true
	}
	return result, nil
}

type dayStats struct {
	Date            string   `json:"date"`
	Peak            int      `json:"peak"`
	ListenerHours   *float64 `json:"listenerHours"`
	MeasuredSeconds float64  `json:"measuredSeconds"`
}
type totalsStats struct {
	Peak            *int     `json:"peak"`
	ListenerHours   *float64 `json:"listenerHours"`
	MeasuredSeconds *float64 `json:"measuredSeconds"`
}
type statsStatus struct {
	Available bool        `json:"available"`
	Days      []dayStats  `json:"days"`
	Totals    totalsStats `json:"totals"`
}

func (c *controller) stats(ctx context.Context) (statsStatus, error) {
	result := statsStatus{Days: []dayStats{}}
	rows, err := c.db.QueryContext(ctx, "SELECT date,peak,listener_seconds,measured_seconds FROM daily ORDER BY date")
	if err != nil {
		return statsStatus{}, err
	}
	defer rows.Close()
	peak := 0
	hours := 0.0
	seconds := 0.0
	for rows.Next() {
		var d dayStats
		var listenerSeconds float64
		if err = rows.Scan(&d.Date, &d.Peak, &listenerSeconds, &d.MeasuredSeconds); err != nil {
			return statsStatus{}, err
		}
		if d.MeasuredSeconds > 0 {
			h := listenerSeconds / 3600
			d.ListenerHours = &h
			hours += h
		}
		seconds += d.MeasuredSeconds
		peak = max(peak, d.Peak)
		result.Days = append(result.Days, d)
	}
	if err = rows.Err(); err != nil {
		return statsStatus{}, err
	}
	result.Available = true
	if len(result.Days) > 0 {
		result.Totals.Peak = &peak
		result.Totals.MeasuredSeconds = &seconds
	}
	if seconds > 0 {
		result.Totals.ListenerHours = &hours
	}
	return result, nil
}
