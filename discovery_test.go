package main

import (
	"bytes"
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"image"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiscoveryPublicReads(t *testing.T) {
	c := testController(t)
	dir := filepath.Join(c.cfg.StateDir, "discovery")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "catalogue.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE entities(id TEXT PRIMARY KEY,kind TEXT,plex_id TEXT,name TEXT,doc TEXT); CREATE TABLE media(sha TEXT PRIMARY KEY,path TEXT);`)
	if err != nil {
		t.Fatal(err)
	}
	id := "trk_000000000001"
	raw := `{"id":"trk_000000000001","type":"track","title":"100% Real","connections":[{"id":"art_000000000001"}]}`
	_, err = db.Exec("INSERT INTO entities VALUES(?,?,?,?,?)", id, "track", "123", "100% Real", raw)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec("INSERT INTO entities VALUES(?,?,?,?,?)", "art_000000000001", "artist", "", "Test artist", `{"id":"art_000000000001","type":"artist","title":"Test artist","connections":[]}`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	library, err := sql.Open("sqlite", filepath.Join(c.cfg.StateDir, "library.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = library.Exec(`CREATE TABLE tracks(id TEXT PRIMARY KEY,title TEXT,artist TEXT,duration INTEGER);
	CREATE TABLE track_details(id TEXT PRIMARY KEY,album_id TEXT,album TEXT,artist_id TEXT,cover_path TEXT,portrait_path TEXT);
	INSERT INTO tracks VALUES('128670','Bipoler Assaults','Blausch;Meshcut',180000),('123','Basic title','Artist',1000),('2','No artwork','Artist',1000);
	INSERT INTO track_details VALUES('128670','9','Release','8','/library/metadata/9/thumb/1','');`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = library.Exec("UPDATE tracks SET title=title||? WHERE id='128670'", c.cfg.PlexToken); err != nil {
		t.Fatal(err)
	}
	library.Close()
	handler := c.routes()
	get := func(path string) *httptest.ResponseRecorder {
		t.Helper()
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		return w
	}
	w := get("/api/discovery/track/123")
	var result struct {
		Entity   map[string]any   `json:"entity"`
		Included []map[string]any `json:"included"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || result.Entity["id"] != id || len(result.Included) != 1 {
		t.Fatalf("entity lookup: %d %s", w.Code, w.Body)
	}
	for _, path := range []string{"/api/discovery/track/128670", "/api/discovery/entity/plex_128670"} {
		basic := get(path)
		var data struct {
			Entity   map[string]any
			Included []any
		}
		if basic.Code != 200 || json.Unmarshal(basic.Body.Bytes(), &data) != nil {
			t.Fatalf("basic lookup: %d %s", basic.Code, basic.Body)
		}
		if data.Entity["id"] != "plex_128670" || data.Entity["title"] != "Bipoler Assaults" || data.Entity["artist"] != "Blausch;Meshcut" || data.Entity["album"] != "Release" || data.Entity["basicDetails"] != true || data.Entity["durationMs"] != float64(180000) || data.Included == nil {
			t.Fatal(data)
		}
		if !strings.HasPrefix(data.Entity["image"].(string), "/api/library/artwork/128670/cover?v=") || strings.Contains(basic.Body.String(), "/library/metadata/") || strings.Contains(basic.Body.String(), c.cfg.PlexToken) {
			t.Fatal("unsafe basic details", basic.Body)
		}
	}
	if rich := get("/api/discovery/entity/plex_123"); rich.Code != 200 || !strings.Contains(rich.Body.String(), id) || strings.Contains(rich.Body.String(), "basicDetails") {
		t.Fatal("alias did not prefer rich profile", rich.Body)
	}
	if bare := get("/api/discovery/track/2"); bare.Code != 200 || !strings.Contains(bare.Body.String(), `"image":""`) {
		t.Fatal("missing artwork blocked details", bare.Body)
	}
	if strings.Contains(w.Body.String(), "secret") || strings.Contains(w.Body.String(), c.cfg.StateDir) {
		t.Fatal("private information exposed")
	}
	if w := get("/api/discovery/search?q=%25"); w.Code != 200 || !strings.Contains(w.Body.String(), "100% Real") || strings.Contains(w.Body.String(), "Test artist") {
		t.Fatalf("literal search: %d %s", w.Code, w.Body)
	}
	for _, path := range []string{"/api/discovery/entity/plex_", "/api/discovery/entity/plex_invalid", "/api/discovery/entity/plex_999", "/api/discovery/preview/plex_128670", "/api/discovery/entity/invalid", "/api/discovery/track/999", "/api/discovery/media/invalid", "/api/discovery/preview/art_000000000001"} {
		if w := get(path); w.Code != 404 {
			t.Fatalf("%s = %d", path, w.Code)
		}
	}
	if w := get("/api/discovery/search?q=" + strings.Repeat("a", 201)); w.Code != 400 {
		t.Fatalf("unbounded search = %d", w.Code)
	}
	if err := os.Mkdir(filepath.Join(dir, "previews"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "previews", id+".mp3"), []byte("audio-test-fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	if w := get("/api/discovery/entity/" + id); !strings.Contains(w.Body.String(), "previewUrl") {
		t.Fatal("prepared preview missing")
	}
	r := httptest.NewRequest("GET", "/api/discovery/preview/"+id, nil)
	r.Header.Set("Range", "bytes=0-4")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 206 || w.Body.String() != "audio" || w.Header().Get("Content-Type") != "audio/mpeg" {
		t.Fatalf("preview range: %d %s", w.Code, w.Body)
	}
	db, err = sql.Open("sqlite", filepath.Join(dir, "catalogue.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("DELETE FROM entities WHERE id=?", id); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if w := get("/api/discovery/preview/" + id); w.Code != 404 {
		t.Fatal("deleted track retained public preview", w.Code)
	}
	if err := os.Remove(filepath.Join(c.cfg.StateDir, "library.sqlite")); err != nil {
		t.Fatal(err)
	}
	if missing := get("/api/discovery/track/128670"); missing.Code != 503 {
		t.Fatal("missing library reported as unknown track", missing.Code)
	}
	if err := os.Remove(filepath.Join(dir, "catalogue.sqlite")); err != nil {
		t.Fatal(err)
	}
	if w := get("/api/discovery/track/123"); w.Code != 503 {
		t.Fatalf("missing cache = %d", w.Code)
	}
	if w := get("/api/discovery/preview/" + id); w.Code != 503 {
		t.Fatal("missing catalogue allowed preview", w.Code)
	}
}

func TestDiscoveryMediaRequiresManifestAndChecksum(t *testing.T) {
	c := testController(t)
	dir := filepath.Join(c.cfg.StateDir, "discovery")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "catalogue.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("CREATE TABLE media(sha TEXT PRIMARY KEY,path TEXT)"); err != nil {
		t.Fatal(err)
	}
	var data bytes.Buffer
	if err := jpeg.Encode(&data, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
		t.Fatal(err)
	}
	sum := sha1.Sum(data.Bytes())
	sha := hex.EncodeToString(sum[:])
	_, err = db.Exec("INSERT INTO media VALUES(?,?)", sha, "/api/plugins/pavoia-catalogue/v1/media?f=public.jpg")
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	if err := os.WriteFile(filepath.Join(dir, ".api-key"), []byte("private-test-key"), 0600); err != nil {
		t.Fatal(err)
	}
	corrupt := true
	calls := 0
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Scheme+"://"+r.URL.Host != hermesOrigin || r.Header.Get("Authorization") != "Bearer private-test-key" {
			t.Fatal("invalid image request boundary")
		}
		if corrupt {
			return reply(r, 200, "wrong image bytes"), nil
		}
		return reply(r, 200, data.String()), nil
	})
	get := func(id string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		c.routes().ServeHTTP(w, httptest.NewRequest("GET", "/api/discovery/media/"+id, nil))
		return w
	}
	if w := get(strings.Repeat("0", 40)); w.Code != 404 || calls != 0 {
		t.Fatal("unknown asset contacted upstream")
	}
	if w := get(sha); w.Code != 503 {
		t.Fatal("invalid checksum accepted")
	}
	corrupt = false
	if w := get(sha); w.Code != 200 || !bytes.Equal(w.Body.Bytes(), data.Bytes()) || strings.Contains(w.Header().Get("Authorization"), "private") {
		t.Fatal("valid media failed or exposed auth")
	}
	callsBefore := calls
	if w := get(sha); w.Code != 200 || calls != callsBefore {
		t.Fatal("image cache missed")
	}
	// A response writer must never inherit the cache lock.
	w := &artworkLockWriter{ResponseRecorder: httptest.NewRecorder(), controller: c, t: t}
	c.routes().ServeHTTP(w, httptest.NewRequest("GET", "/api/discovery/media/"+sha, nil))
	if w.Code != 200 {
		t.Fatal("image response failed")
	}
	cached := filepath.Join(dir, "images", artworkKey(sha)+".img")
	if err := os.WriteFile(cached, data.Bytes()[:10], 0600); err != nil {
		t.Fatal(err)
	}
	if w := get(sha); w.Code != 200 || !bytes.Equal(w.Body.Bytes(), data.Bytes()) || calls != callsBefore+1 {
		t.Fatal("corrupt cache entry was served")
	}
	db, err = sql.Open("sqlite", filepath.Join(dir, "catalogue.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("DELETE FROM media"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if w := get(sha); w.Code != 404 {
		t.Fatal("cached image outlived its manifest entry")
	}
	if err := os.Remove(filepath.Join(dir, "catalogue.sqlite")); err != nil {
		t.Fatal(err)
	}
	if w := get(strings.Repeat("1", 40)); w.Code != 503 {
		t.Fatal("missing database reported as unknown asset")
	}
}

type artworkLockWriter struct {
	*httptest.ResponseRecorder
	controller *controller
	t          *testing.T
}

func (w *artworkLockWriter) Write(data []byte) (int, error) {
	if !w.controller.artMu.TryLock() {
		w.t.Error("response write holds the shared artwork lock")
	} else {
		w.controller.artMu.Unlock()
	}
	return w.ResponseRecorder.Write(data)
}

func TestDiscoveryRejectsIncompleteImageWithMatchingChecksum(t *testing.T) {
	var whole bytes.Buffer
	if err := jpeg.Encode(&whole, image.NewRGBA(image.Rect(0, 0, 16, 16)), nil); err != nil {
		t.Fatal(err)
	}
	for _, data := range [][]byte{whole.Bytes(), whole.Bytes()[:whole.Len()-10]} {
		sum := sha1.Sum(data)
		valid := validDiscoveryImage(data, hex.EncodeToString(sum[:]))
		if valid != (len(data) == whole.Len()) {
			t.Fatalf("unexpected image validation for %d bytes: %v", len(data), valid)
		}
	}
}
