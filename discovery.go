package main

import (
	"bytes"
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var discoveryID = regexp.MustCompile(`^(art|trk|rel|lab|pl)_[a-f0-9]{12}$`)
var discoverySHA = regexp.MustCompile(`^[a-f0-9]{40}$`)

const hermesOrigin = "https://gaende-slave-5720.agents.nousresearch.com"

func (c *controller) discoveryDB() (*sql.DB, error) {
	u := url.URL{Scheme: "file", Path: filepath.Join(c.cfg.StateDir, "discovery", "catalogue.sqlite"), RawQuery: "mode=ro&immutable=1"}
	db, err := sql.Open("sqlite", u.String())
	if err == nil {
		db.SetMaxOpenConns(1)
	}
	return db, err
}

// Documents are served as stored: ops/discovery_sync.py projects every Hermes record
// through a field allowlist with text and URL cleaning, so the cache holds only public fields.
func (c *controller) discoveryEntity(w http.ResponseWriter, r *http.Request) {
	id, plex := r.PathValue("id"), r.PathValue("plex")
	if strings.HasPrefix(id, "plex_") {
		plex, id = strings.TrimPrefix(id, "plex_"), ""
		if validID(plex) == "" {
			http.NotFound(w, r)
			return
		}
	}
	if (id != "" && !discoveryID.MatchString(id)) || (plex != "" && validID(plex) == "") {
		http.NotFound(w, r)
		return
	}
	db, err := c.discoveryDB()
	if err != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	defer db.Close()
	var raw string
	if plex != "" {
		err = db.QueryRowContext(r.Context(), "SELECT doc FROM entities WHERE kind='track' AND plex_id=?", plex).Scan(&raw)
	} else {
		err = db.QueryRowContext(r.Context(), "SELECT doc FROM entities WHERE id=?", id).Scan(&raw)
	}
	if errors.Is(err, sql.ErrNoRows) && plex != "" {
		c.discoveryLibraryTrack(w, r, plex)
		return
	}
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	var entity map[string]any
	if json.Unmarshal([]byte(raw), &entity) != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	type connection struct {
		ID string `json:"id"`
	}
	var refs struct {
		Connections []connection `json:"connections"`
	}
	if json.Unmarshal([]byte(raw), &refs) != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	included := []json.RawMessage{}
	for index, ref := range refs.Connections {
		if index >= 80 {
			break
		}
		var doc string
		if db.QueryRowContext(r.Context(), "SELECT doc FROM entities WHERE id=?", ref.ID).Scan(&doc) == nil {
			included = append(included, json.RawMessage(doc))
		}
	}
	entityID, _ := entity["id"].(string)
	if discoveryID.MatchString(entityID) {
		if info, e := os.Stat(filepath.Join(c.cfg.StateDir, "discovery", "previews", entityID+".mp3")); e == nil && info.Mode().IsRegular() && info.Size() > 0 && info.Size() < 5<<20 {
			entity["previewUrl"] = "/api/discovery/preview/" + entityID
		}
	}
	jsonResponse(w, 200, map[string]any{"entity": entity, "included": included})
}

func (c *controller) discoverySearch(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) > 200 {
		http.Error(w, "invalid search", 400)
		return
	}
	db, err := c.discoveryDB()
	if err != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	defer db.Close()
	pattern := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(query) + "%"
	rows, err := db.QueryContext(r.Context(), `SELECT doc FROM entities WHERE kind!='playlist' AND name LIKE ? ESCAPE '\' ORDER BY CASE kind WHEN 'artist' THEN 0 WHEN 'release' THEN 1 ELSE 2 END,name,id LIMIT 40`, pattern)
	if err != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	defer rows.Close()
	result := []json.RawMessage{}
	for rows.Next() {
		var raw string
		if err = rows.Scan(&raw); err != nil {
			break
		}
		result = append(result, json.RawMessage(raw))
	}
	if err != nil || rows.Err() != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	jsonResponse(w, 200, map[string]any{"items": result})
}

var errDiscoveryMissing = errors.New("discovery media missing")

func (c *controller) discoveryMedia(w http.ResponseWriter, r *http.Request) {
	sha := r.PathValue("sha")
	if !discoverySHA.MatchString(sha) {
		http.NotFound(w, r)
		return
	}
	data, err := c.cachedDiscovery(r, sha)
	if errors.Is(err, errDiscoveryMissing) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, "image unavailable", 503)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	w.Header().Set("ETag", `"`+sha+`"`)
	http.ServeContent(w, r, "image.jpg", time.Time{}, bytes.NewReader(data))
}

// The lock covers the cache and the upstream fetch, never the response to a slow client.
// This cache never takes the playback/state lock.
func (c *controller) cachedDiscovery(r *http.Request, sha string) ([]byte, error) {
	c.artMu.Lock()
	defer c.artMu.Unlock()
	if r.Context().Err() != nil {
		return nil, r.Context().Err()
	}
	// The manifest decides what is public, so it is checked before the cache.
	db, err := c.discoveryDB()
	if err != nil {
		return nil, err
	}
	var path string
	err = db.QueryRowContext(r.Context(), "SELECT path FROM media WHERE sha=?", sha).Scan(&path)
	db.Close()
	if errors.Is(err, sql.ErrNoRows) || err == nil && !strings.HasPrefix(path, "/api/plugins/pavoia-catalogue/v1/media?f=") {
		return nil, errDiscoveryMissing
	}
	if err != nil {
		return nil, err
	}
	dir := filepath.Join(c.cfg.StateDir, "discovery", "images")
	file := filepath.Join(dir, artworkKey(sha)+".img")
	if info, err := os.Lstat(file); err == nil && info.Mode().IsRegular() && info.Size() <= maxArtworkBytes {
		if data, err := os.ReadFile(file); err == nil && validDiscoveryImage(data, sha) {
			return data, nil
		}
	}
	key, err := os.ReadFile(filepath.Join(c.cfg.StateDir, "discovery", ".api-key"))
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(r.Context(), "GET", hermesOrigin+path, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(string(key)))
	response, err := c.client.Do(request)
	if err != nil {
		return nil, errArtworkUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, errArtworkUnavailable
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxArtworkBytes+1))
	if err != nil || !validDiscoveryImage(data, sha) {
		return nil, errArtworkUnavailable
	}
	if os.MkdirAll(dir, 0700) == nil && writeAtomic(file, data) == nil {
		_ = pruneArtwork(dir)
	}
	return data, nil
}

func validDiscoveryImage(data []byte, sha string) bool {
	if len(data) > maxArtworkBytes {
		return false
	}
	sum := sha1.Sum(data)
	if hex.EncodeToString(sum[:]) != sha {
		return false
	}
	dimensions, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || format != "jpeg" || dimensions.Width < 1 || dimensions.Height < 1 || int64(dimensions.Width)*int64(dimensions.Height) > 25000000 {
		return false
	}
	_, _, err = image.Decode(bytes.NewReader(data))
	return err == nil
}

func (c *controller) discoveryPreview(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !discoveryID.MatchString(id) || !strings.HasPrefix(id, "trk_") {
		http.NotFound(w, r)
		return
	}
	db, err := c.discoveryDB()
	if err != nil {
		http.Error(w, "preview unavailable", 503)
		return
	}
	var published bool
	err = db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM entities WHERE id=? AND kind='track')", id).Scan(&published)
	db.Close()
	if err != nil {
		http.Error(w, "preview unavailable", 503)
		return
	}
	if !published {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(c.cfg.StateDir, "discovery", "previews", id+".mp3")
	file, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > 5<<20 {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=300")
	http.ServeContent(w, r, "preview.mp3", info.ModTime(), file)
}
