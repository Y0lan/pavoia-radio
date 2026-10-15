package main

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var artworkPathPattern = regexp.MustCompile(`^/library/metadata/[0-9]{1,32}/(thumb|art)/[0-9]+$`)
var cacheFilePattern = regexp.MustCompile(`^[0-9a-f]{64}\.img$`)

const maxArtworkBytes = 8 << 20
const maxArtworkCache = 64 << 20
const artworkSize = 640

func validArtworkPath(path string) string {
	if artworkPathPattern.MatchString(path) {
		return path
	}
	return ""
}
func artworkKey(path string) string {
	// Version the cache so original full-resolution images are not reused as thumbnails.
	sum := sha256.Sum256([]byte("thumbnail-640-jpeg-v1:" + path))
	return hex.EncodeToString(sum[:])
}
func (c *controller) artworkURL(id, kind, path string) string {
	if validArtworkPath(path) == "" {
		return ""
	}
	return "/api/radio/" + c.stage.ID + "/artwork/" + id + "/" + kind + "?v=" + artworkKey(path)[:16]
}

func artworkType(data []byte) (string, error) {
	if len(data) > maxArtworkBytes {
		return "", errArtworkUnavailable
	}
	info, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || info.Width < 1 || info.Height < 1 || info.Width > artworkSize || info.Height > artworkSize {
		return "", errArtworkUnavailable
	}
	// The header alone passes for a truncated file; decoding the bounded image proves it is whole.
	if _, _, err = image.Decode(bytes.NewReader(data)); err != nil {
		return "", errArtworkUnavailable
	}
	switch format {
	case "jpeg":
		return "image/jpeg", nil
	case "png":
		return "image/png", nil
	}
	return "", errArtworkUnavailable
}

func (c *controller) artwork(w http.ResponseWriter, r *http.Request) {
	source, err := artworkSource(c.db, r)
	c.serveArtwork(w, r, source, err)
}

func (c *controller) libraryArtwork(w http.ResponseWriter, r *http.Request) {
	db, err := c.openLibrary()
	if err != nil {
		http.Error(w, "artwork unavailable", 503)
		return
	}
	defer db.Close()
	source, err := artworkSource(db, r)
	c.serveArtwork(w, r, source, err)
}

func (c *controller) serveArtwork(w http.ResponseWriter, r *http.Request, source string, err error) {
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, "artwork unavailable", 503)
		return
	}
	data, err := c.cachedArtwork(r, source)
	if err != nil {
		w.Header().Set("Retry-After", "5")
		http.Error(w, "artwork unavailable", 503)
		return
	}
	contentType, err := artworkType(data)
	if err != nil {
		http.Error(w, "artwork unavailable", 503)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("ETag", `"`+artworkKey(source)+`"`)
	http.ServeContent(w, r, "artwork", time.Time{}, bytes.NewReader(data))
}

func (c *controller) cachedArtwork(r *http.Request, source string) ([]byte, error) {
	// Separate lock: a slow image fetch cannot block playback selection or callbacks.
	c.artMu.Lock()
	defer c.artMu.Unlock()
	if r.Context().Err() != nil {
		return nil, r.Context().Err()
	}
	dir := filepath.Join(c.cfg.StateDir, "artwork")
	path := filepath.Join(dir, artworkKey(source)+".img")
	if info, err := os.Lstat(path); err == nil && info.Mode().IsRegular() && info.Size() <= maxArtworkBytes {
		data, err := os.ReadFile(path)
		if err == nil {
			if _, err = artworkType(data); err == nil {
				return data, nil
			}
		}
	}
	params := url.Values{"url": {source}, "width": {"640"}, "height": {"640"}, "minSize": {"0"}, "upscale": {"0"}, "format": {"jpeg"}}
	request, err := http.NewRequestWithContext(r.Context(), "GET", strings.TrimRight(c.cfg.PlexURL, "/")+"/photo/:/transcode?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("X-Plex-Token", c.cfg.PlexToken)
	response, err := c.client.Do(request)
	if err != nil {
		return nil, errArtworkUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, errArtworkUnavailable
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxArtworkBytes+1))
	if err != nil {
		return nil, errArtworkUnavailable
	}
	if _, err = artworkType(data); err != nil {
		return nil, err
	}
	if err = os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	if err = writeAtomic(path, data); err != nil {
		return nil, err
	}
	if err = pruneArtwork(dir); err != nil {
		return nil, err
	}
	return data, nil
}

func pruneArtwork(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	files := []os.FileInfo{}
	var total int64
	for _, entry := range entries {
		if !cacheFilePattern.MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode().IsRegular() {
			files = append(files, info)
			total += info.Size()
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].ModTime().Before(files[j].ModTime()) })
	for _, file := range files {
		if total <= maxArtworkCache {
			break
		}
		if err = os.Remove(filepath.Join(dir, file.Name())); err != nil {
			return err
		}
		total -= file.Size()
	}
	return nil
}
