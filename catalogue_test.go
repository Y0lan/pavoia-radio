package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCatalogueArtworkAndOfflineCache(t *testing.T) {
	c := testController(t)
	tr := addTrack(t, c, "123", "Performer")
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/playlists/146686/items" {
			t.Fatalf("unexpected request: %s", r.URL.Path)
		}
		body := strings.Replace(plexPage(0, 1, []track{tr}), `duration="180000"`, `duration="180000" parentRatingKey="9" parentTitle="Release" grandparentRatingKey="8" thumb="/library/metadata/9/thumb/1" grandparentThumb="/library/metadata/8/thumb/1"`, 1)
		return reply(r, 200, body), nil
	})
	if err := c.syncPlaylist(context.Background()); err != nil {
		t.Fatal(err)
	}
	handler := c.routes()
	catalog := request(handler, "GET", "/api/radio/palac-feel/catalogue?q=Release", "", "")
	if catalog.Code != 200 {
		t.Fatal(catalog.Code, catalog.Body.String())
	}
	var data struct {
		Tracks []publicTrack `json:"tracks"`
		Next   *string       `json:"next"`
	}
	if err := json.Unmarshal(catalog.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Tracks) != 1 || data.Tracks[0].Album != "Release" || data.Tracks[0].AlbumID != "9" || data.Tracks[0].ArtistID != "8" || data.Tracks[0].ArtistImageURL == "" {
		t.Fatal(data)
	}
	for _, private := range []string{c.cfg.PlexToken, c.cfg.MusicRoot, "/library/metadata/"} {
		if strings.Contains(catalog.Body.String(), private) {
			t.Fatal("private metadata exposed")
		}
	}
	imageData := image.NewRGBA(image.Rect(0, 0, 2, 2))
	imageData.Set(0, 0, color.White)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, imageData, nil); err != nil {
		t.Fatal(err)
	}
	calls := 0
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "plex.invalid" || r.URL.Path != "/photo/:/transcode" || r.Header.Get("X-Plex-Token") != c.cfg.PlexToken {
			t.Fatal("incorrect artwork origin")
		}
		q := r.URL.Query()
		if q.Get("url") != "/library/metadata/9/thumb/1" || q.Get("width") != "640" || q.Get("height") != "640" || q.Get("upscale") != "0" || q.Get("minSize") != "0" || q.Get("format") != "jpeg" || strings.Contains(r.URL.RawQuery, c.cfg.PlexToken) {
			t.Fatal("incorrect thumbnail request")
		}
		return reply(r, 200, encoded.String()), nil
	})
	url := data.Tracks[0].CoverURL
	first := request(handler, "GET", url, "", "")
	if first.Code != 200 || first.Header().Get("Content-Type") != "image/jpeg" || !bytes.Equal(first.Body.Bytes(), encoded.Bytes()) {
		t.Fatal(first.Code, first.Body.String())
	}
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) { t.Fatal("cached image fetched again"); return nil, nil })
	cached := request(handler, "GET", url, "", "")
	if cached.Code != 200 || calls != 1 {
		t.Fatal("cache failed")
	}
	for _, path := range []string{"/api/radio/palac-feel/artwork/999/cover", "/api/radio/palac-feel/artwork/123/file", "/api/radio/palac-dance/artwork/123/cover"} {
		if r := request(handler, "GET", path, "", ""); r.Code != 404 {
			t.Fatal(path, r.Code)
		}
	}
	if r := request(handler, "GET", "/api/radio/palac-feel/catalogue?limit=101", "", ""); r.Code != 400 {
		t.Fatal(r.Code)
	}
	// A failed sync must retain catalogue details and offline artwork.
	c.client.Transport = transportFunc(func(*http.Request) (*http.Response, error) { return nil, errors.New("offline") })
	if err := c.syncPlaylist(context.Background()); err == nil {
		t.Fatal("expected transport failure")
	}
	retained := request(handler, "GET", "/api/radio/palac-feel/catalogue?q=Release", "", "")
	if retained.Code != 200 || !strings.Contains(retained.Body.String(), `"album":"Release"`) {
		t.Fatal("failed sync lost details")
	}
}

func TestCompilationAttributionAndCataloguePagination(t *testing.T) {
	c := testController(t)
	one := addTrack(t, c, "1", "Various Artists")
	two := addTrack(t, c, "2", "Another artist")
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		body := strings.Replace(plexPage(0, 2, []track{one, two}), `grandparentTitle="Various Artists"`, `grandparentTitle="Various Artists" originalTitle="Actual performer" grandparentRatingKey="8" grandparentThumb="/library/metadata/8/thumb/1"`, 1)
		return reply(r, 200, body), nil
	})
	if err := c.syncPlaylist(context.Background()); err != nil {
		t.Fatal(err)
	}
	response := request(c.routes(), "GET", "/api/radio/palac-feel/catalogue?limit=1", "", "")
	var data struct {
		Tracks []publicTrack `json:"tracks"`
		Next   *string       `json:"next"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Tracks) != 1 || data.Tracks[0].Artist != "Actual performer" || data.Tracks[0].ArtistImageURL != "" || data.Tracks[0].ArtistID != "" || data.Next == nil || *data.Next != "1" {
		t.Fatal(data)
	}
	next := request(c.routes(), "GET", "/api/radio/palac-feel/catalogue?limit=1&after=1", "", "")
	if !strings.Contains(next.Body.String(), `"id":"2"`) || !strings.Contains(next.Body.String(), `"next":null`) {
		t.Fatal(next.Body.String())
	}
}

func TestArtworkValidationAndBoundedCache(t *testing.T) {
	for _, path := range []string{"https://example.test/image", "/library/metadata/9/thumb/1?token=x", "/library/parts/9/file.mp3"} {
		if validArtworkPath(path) != "" {
			t.Fatal("unsafe source accepted")
		}
	}
	if _, err := artworkType([]byte("<svg></svg>")); err == nil {
		t.Fatal("unsupported image accepted")
	}
	var oversized bytes.Buffer
	if err := jpeg.Encode(&oversized, image.NewRGBA(image.Rect(0, 0, artworkSize+1, 1)), nil); err != nil {
		t.Fatal(err)
	}
	if _, err := artworkType(oversized.Bytes()); err == nil {
		t.Fatal("oversized thumbnail accepted")
	}
	// Noise keeps the header small next to the pixel data, so the cut lands inside the pixels.
	noise := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for i := range noise.Pix {
		noise.Pix[i] = uint8(i * 7)
	}
	var whole bytes.Buffer
	if err := jpeg.Encode(&whole, noise, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := artworkType(whole.Bytes()[:whole.Len()*9/10]); err == nil {
		t.Fatal("truncated image accepted")
	}
	dir := t.TempDir()
	keep := filepath.Join(dir, "unrelated")
	if err := os.WriteFile(keep, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	for i, key := range []string{strings.Repeat("a", 64), strings.Repeat("b", 64)} {
		name := filepath.Join(dir, key+".img")
		f, err := os.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if err = f.Truncate(40 << 20); err != nil {
			t.Fatal(err)
		}
		f.Close()
		stamp := time.Unix(int64(i), 0)
		if err = os.Chtimes(name, stamp, stamp); err != nil {
			t.Fatal(err)
		}
	}
	if err := pruneArtwork(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, strings.Repeat("a", 64)+".img")); !os.IsNotExist(err) {
		t.Fatal("old cache retained above limit")
	}
	if _, err := os.Stat(keep); err != nil {
		t.Fatal("unrelated file removed")
	}
}

func TestLibrarySnapshotRoutes(t *testing.T) {
	c := testController(t)
	h := c.routes()
	path := filepath.Join(c.cfg.StateDir, "library.sqlite")
	if r := request(h, "GET", "/api/library/catalogue", "", ""); r.Code != 503 {
		t.Fatal(r.Code)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("Missing snapshot was created", err)
	}
	snapshot, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = snapshot.Exec(`CREATE TABLE tracks(id TEXT PRIMARY KEY,title TEXT,artist TEXT,duration INTEGER);
 CREATE TABLE track_details(id TEXT PRIMARY KEY,album_id TEXT,album TEXT,artist_id TEXT,cover_path TEXT,portrait_path TEXT);
 CREATE TABLE library_info(total INTEGER,updated_at TEXT);
 INSERT INTO tracks VALUES('99','Outside radio','Artist',1000);
 INSERT INTO track_details VALUES('99','9','Album','','/library/metadata/9/thumb/1','');
 INSERT INTO library_info VALUES(1,'2026-10-07T00:00:00Z');`)
	if err != nil {
		t.Fatal(err)
	}
	snapshot.Close()
	r := request(h, "GET", "/api/library/catalogue?q=Outside", "", "")
	if r.Code != 200 || !strings.Contains(r.Body.String(), `"total":1`) || !strings.Contains(r.Body.String(), "/api/library/artwork/99/cover") {
		t.Fatal(r.Code, r.Body.String())
	}
	if strings.Contains(r.Body.String(), "/library/metadata/") {
		t.Fatal("Private image path exposed")
	}
	r = request(h, "GET", "/api/radio/palac-feel/catalogue", "", "")
	if strings.Contains(r.Body.String(), "Outside radio") {
		t.Fatal("Full library entered radio selection")
	}
	imageData := image.NewRGBA(image.Rect(0, 0, 2, 2))
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, imageData, nil); err != nil {
		t.Fatal(err)
	}
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) { return reply(r, 200, encoded.String()), nil })
	r = request(h, "GET", "/api/library/artwork/99/cover", "", "")
	if r.Code != 200 {
		t.Fatal(r.Code, r.Body.String())
	}
	for _, url := range []string{"/api/radio/palac-feel/artwork/99/cover", "/api/library/artwork/98/cover", "/api/library/artwork/99/portrait", "/api/library/artwork/99/file"} {
		if r = request(h, "GET", url, "", ""); r.Code != 404 {
			t.Fatal(url, r.Code)
		}
	}
	db, err := c.openLibrary()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("DELETE FROM tracks"); err == nil {
		t.Fatal("Snapshot is writable")
	}
	db.Close()
	replacement := filepath.Join(c.cfg.StateDir, "replacement.sqlite")
	snapshot, err = sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = snapshot.Exec("VACUUM INTO ?", replacement); err != nil {
		t.Fatal(err)
	}
	snapshot.Close()
	snapshot, err = sql.Open("sqlite", replacement)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = snapshot.Exec("UPDATE tracks SET title='New snapshot'"); err != nil {
		t.Fatal(err)
	}
	snapshot.Close()
	if err = os.Rename(replacement, path); err != nil {
		t.Fatal(err)
	}
	r = request(h, "GET", "/api/library/catalogue", "", "")
	if r.Code != 200 || !strings.Contains(r.Body.String(), "New snapshot") {
		t.Fatal(r.Code, r.Body.String())
	}
	if r = request(h, "GET", "/api/library/catalogue?limit=101", "", ""); r.Code != 400 {
		t.Fatal(r.Code)
	}
}

func TestLibraryStatisticsBoundary(t *testing.T) {
	c := testController(t)
	if r := request(c.routes(), "GET", "/api/library/statistics", "", ""); r.Code != 503 {
		t.Fatal("missing snapshot presented as empty stats")
	}
	path := filepath.Join(c.cfg.StateDir, "library.sqlite")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("CREATE TABLE music_statistics(scope TEXT PRIMARY KEY,doc TEXT)"); err != nil {
		t.Fatal(err)
	}
	doc := `{"scope":"radio","tracks":2,"coverage":{"labels":0},"topArtists":[{"name":"Artist /private/audio/file.mp3 internal-secret-token","count":2}],"private":"hidden"}`
	if _, err = db.Exec("INSERT INTO music_statistics VALUES(?,?)", "radio", doc); err != nil {
		t.Fatal(err)
	}
	db.Close()
	r := request(c.routes(), "GET", "/api/library/statistics", "", "")
	if r.Code != 200 || strings.Contains(r.Body.String(), "private") || strings.Contains(r.Body.String(), c.cfg.InternalToken) {
		t.Fatal(r.Code, r.Body.String())
	}
	if r := request(c.routes(), "GET", "/api/library/statistics?scope=bus", "", ""); r.Code != 400 {
		t.Fatal(r.Code)
	}
}
