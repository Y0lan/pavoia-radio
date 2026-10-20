package main

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"strings"
	"time"
)

//go:embed web/*
var assets embed.FS

func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (c *controller) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/audience", c.liveAudienceStatus)
	mux.HandleFunc("GET /api/discovery/entity/{id}", c.discoveryEntity)
	mux.HandleFunc("GET /api/discovery/track/{plex}", c.discoveryEntity)
	mux.HandleFunc("GET /api/discovery/search", c.discoverySearch)
	mux.HandleFunc("GET /api/discovery/media/{sha}", c.discoveryMedia)
	mux.HandleFunc("GET /api/discovery/preview/{id}", c.discoveryPreview)
	mux.HandleFunc("GET /api/library/catalogue", c.libraryCatalogue)
	mux.HandleFunc("GET /api/library/statistics", c.libraryStatistics)
	mux.HandleFunc("GET /api/library/names", c.libraryNames)
	mux.HandleFunc("GET /api/library/artwork/{id}/{kind}", c.libraryArtwork)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		if c.db.PingContext(r.Context()) != nil {
			http.Error(w, "unavailable", 503)
			return
		}
		w.WriteHeader(200)
	})
	mux.HandleFunc("GET /api/radio/"+c.stage.ID, c.radioStatus)
	mux.HandleFunc("GET /api/radio/"+c.stage.ID+"/artwork/{id}/{kind}", c.artwork)
	mux.HandleFunc("GET /api/radio/"+c.stage.ID+"/catalogue", c.catalogue)
	mux.HandleFunc("GET /api/radio/"+c.stage.ID+"/changes", c.catalogueChanges)
	mux.HandleFunc("GET /api/radio/"+c.stage.ID+"/history", c.playbackHistory)
	mux.HandleFunc("GET /api/radio/"+c.stage.ID+"/music", c.musicStats)
	mux.HandleFunc("GET /api/radio/"+c.stage.ID+"/stats", func(w http.ResponseWriter, r *http.Request) {
		result, err := c.stats(r.Context())
		if err != nil {
			jsonResponse(w, 503, statsStatus{})
			return
		}
		jsonResponse(w, 200, result)
	})
	mux.Handle("GET /internal/next", c.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uri, err := c.next(r.Context(), time.Now().UTC())
		if err != nil {
			http.Error(w, "unavailable", 503)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		if uri == "" {
			w.WriteHeader(204)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = io.WriteString(w, uri+"\n")
	})))
	mux.Handle("GET /internal/enabled", c.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		enabled, err := c.enabled(r.Context())
		if err != nil {
			http.Error(w, "unavailable", 503)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if enabled {
			_, _ = io.WriteString(w, "true\n")
		} else {
			_, _ = io.WriteString(w, "false\n")
		}
	})))
	mux.Handle("POST /internal/played", c.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mediaType, _, mediaErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if mediaErr != nil || mediaType != "application/json" {
			http.Error(w, "JSON required", 415)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		defer r.Body.Close()
		var callback struct {
			ID        string `json:"id"`
			Event     string `json:"event"`
			StartedAt string `json:"startedAt,omitempty"`
		}
		d := json.NewDecoder(r.Body)
		d.DisallowUnknownFields()
		if err := d.Decode(&callback); err != nil {
			http.Error(w, "invalid callback", 400)
			return
		}
		if err := d.Decode(new(any)); !errors.Is(err, io.EOF) {
			http.Error(w, "invalid callback", 400)
			return
		}
		now := time.Now().UTC()
		started := now
		if callback.StartedAt != "" {
			var err error
			started, err = time.Parse(time.RFC3339, callback.StartedAt)
			if err != nil || started.After(now.Add(5*time.Second)) || started.Before(now.Add(-48*time.Hour)) {
				http.Error(w, "invalid start time", 400)
				return
			}
		}
		if err := c.played(r.Context(), callback.ID, callback.Event, started.UTC()); err != nil {
			switch {
			case errors.Is(err, errInvalidCallback):
				http.Error(w, "invalid callback", 400)
			case errors.Is(err, errCallbackConflict):
				http.Error(w, "callback rejected", 409)
			default:
				http.Error(w, "callback unavailable", 503)
			}
			return
		}
		w.WriteHeader(204)
	})))
	mux.Handle("POST /internal/sync", c.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		defer r.Body.Close()
		data, err := io.ReadAll(r.Body)
		if err != nil || len(strings.TrimSpace(string(data))) > 0 {
			http.Error(w, "empty body required", 400)
			return
		}
		if err = c.syncPlaylist(r.Context()); err != nil {
			if errors.Is(err, errSyncBusy) {
				http.Error(w, "sync already running", 409)
			} else {
				http.Error(w, "sync unavailable", 503)
			}
			return
		}
		w.WriteHeader(204)
	})))
	web, _ := fs.Sub(assets, "web")
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name == "" {
			name = "index.html"
		}
		if !fs.ValidPath(name) {
			http.NotFound(w, r)
			return
		}
		info, err := fs.Stat(web, name)
		if err != nil || !info.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}
		data, err := fs.ReadFile(web, name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(w, r, name, time.Time{}, strings.NewReader(string(data)))
	})
	return mux
}

func (c *controller) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || c.cfg.InternalToken == "" || subtle.ConstantTimeCompare([]byte(token), []byte(c.cfg.InternalToken)) != 1 {
			w.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(w, "unauthorized", 401)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type publicTrack struct {
	ID             string `json:"id"`
	Title          string `json:"title"`
	Artist         string `json:"artist"`
	StartedAt      string `json:"startedAt,omitempty"`
	DurationMS     int64  `json:"durationMs"`
	Album          string `json:"album,omitempty"`
	AlbumID        string `json:"albumId,omitempty"`
	ArtistID       string `json:"artistId,omitempty"`
	CoverURL       string `json:"coverUrl,omitempty"`
	ArtistImageURL string `json:"artistImageUrl,omitempty"`
}
type syncStatus struct {
	LastSuccess *string `json:"lastSuccess"`
	TrackCount  int     `json:"trackCount"`
}
type radioStatus struct {
	Stage struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"stage"`
	Track     *publicTrack   `json:"track"`
	Audience  audienceStatus `json:"audience"`
	Sync      syncStatus     `json:"sync"`
	StreamURL string         `json:"streamUrl"`
}

func (c *controller) radioStatus(w http.ResponseWriter, r *http.Request) {
	result, err := c.snapshot(r.Context(), time.Now().UTC())
	if err != nil {
		jsonResponse(w, 503, result)
		return
	}
	jsonResponse(w, 200, result)
}

func (c *controller) snapshot(ctx context.Context, now time.Time) (radioStatus, error) {
	result := radioStatus{StreamURL: "/stream/" + c.stage.ID + ".mp3"}
	result.Stage.ID = c.stage.ID
	result.Stage.Name = c.stage.Name
	// Hold the lock across these short reads to return one coherent state after sync/callback writes.
	c.mu.Lock()
	defer c.mu.Unlock()
	var err error
	result.Audience, err = c.audience(ctx, now)
	if err != nil {
		return result, err
	}
	if err = c.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tracks").Scan(&result.Sync.TrackCount); err != nil {
		return result, err
	}
	var stamp string
	err = c.db.QueryRowContext(ctx, "SELECT value FROM state WHERE key='last_sync'").Scan(&stamp)
	if err == nil {
		result.Sync.LastSuccess = &stamp
	} else if !errors.Is(err, sql.ErrNoRows) {
		return result, err
	}
	if result.Audience.Available && result.Sync.TrackCount > 0 {
		var t track
		var started int64
		err = c.db.QueryRowContext(ctx, "SELECT id,title,artist,path,duration,started_at FROM playback ORDER BY started_at DESC,rowid DESC LIMIT 1").Scan(&t.ID, &t.Title, &t.Artist, &t.Path, &t.Duration, &started)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return result, err
		}
		// Missing callbacks must not leave a title advertised forever.
		ttl := time.Duration(t.Duration)*time.Millisecond + 30*time.Second
		if t.Duration == 0 {
			ttl = 10 * time.Minute
		}
		if err == nil && now.Sub(time.UnixMilli(started)) >= 0 && now.Sub(time.UnixMilli(started)) <= ttl && c.playable(t.Path) == nil {
			result.Track = &publicTrack{ID: t.ID, Title: c.cleanMetadata(t.Title), Artist: c.cleanMetadata(t.Artist), StartedAt: time.UnixMilli(started).UTC().Format(time.RFC3339), DurationMS: t.Duration}
			var d trackDetails
			detailErr := c.db.QueryRowContext(ctx, "SELECT album_id,album,artist_id,cover_path,portrait_path FROM track_details WHERE id=?", t.ID).Scan(&d.AlbumID, &d.Album, &d.ArtistID, &d.CoverPath, &d.PortraitPath)
			if detailErr == nil {
				c.enrichTrack(result.Track, d)
			} else if !errors.Is(detailErr, sql.ErrNoRows) {
				return result, detailErr
			}
		}
	}
	return result, nil
}
