package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestUnionDeduplicatesAndKeepsLastGoodSelection(t *testing.T) {
	for _, stage := range []string{"fontanna", "etage-zero"} {
		t.Run(stage, func(t *testing.T) {
			c := testControllerStage(t, stage)
			one, two, three := addTrack(t, c, "1", "One"), addTrack(t, c, "2", "Two"), addTrack(t, c, "3", "Three")
			fail := false
			c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
				if r.URL.Path == "/playlists/"+c.stage.PlaylistIDs[0]+"/items" {
					return reply(r, 200, plexPage(0, 2, []track{one, two})), nil
				}
				if r.URL.Path != "/playlists/"+c.stage.PlaylistIDs[1]+"/items" {
					t.Fatalf("wrong source: %s", r.URL.Path)
				}
				if fail {
					return nil, errors.New("offline")
				}
				return reply(r, 200, plexPage(0, 2, []track{two, three})), nil
			})
			if err := c.syncPlaylist(context.Background()); err != nil {
				t.Fatal(err)
			}
			if n := queryCount(t, c, "tracks"); n != 3 {
				t.Fatal(n)
			}
			before, err := os.ReadFile(filepath.Join(c.cfg.StateDir, "fallback.m3u"))
			if err != nil {
				t.Fatal(err)
			}
			fail = true
			if err := c.syncPlaylist(context.Background()); err == nil {
				t.Fatal("partial union accepted")
			}
			after, err := os.ReadFile(filepath.Join(c.cfg.StateDir, "fallback.m3u"))
			if err != nil {
				t.Fatal(err)
			}
			if string(before) != string(after) || queryCount(t, c, "tracks") != 3 {
				t.Fatal("last good selection lost")
			}
		})
	}
	for stage, playlist := range map[string]string{"ambiance": "145472", "closing": "162463"} {
		c := testControllerStage(t, stage)
		if len(c.stage.PlaylistIDs) != 1 || c.stage.PlaylistIDs[0] != playlist {
			t.Fatal(c.stage)
		}
	}
}

func TestHistoryPaginationPeriodIsolationAndStatistics(t *testing.T) {
	c := testController(t)
	addTrack(t, c, "1", "Artist")
	addTrack(t, c, "2", "Silent")
	now := time.Now().UTC().Truncate(time.Second).Add(-time.Minute)
	for i := 0; i < 4; i++ {
		at := now
		if i == 0 {
			at = now.AddDate(0, 0, -40)
		}
		if _, err := c.db.Exec("INSERT INTO playback VALUES(?,?,?,?,?,?,?)", fmt.Sprint("event", i), "1", "Title "+c.cfg.PlexToken+" /private/audio/file.mp3", "Artist", c.cfg.MusicRoot+"/1.mp3", 1000, at.UnixMilli()); err != nil {
			t.Fatal(err)
		}
	}
	type page struct {
		Items              []broadcast
		Next               *string
		From, Until, Stage string
	}
	read := func(path string) page {
		t.Helper()
		r := request(c.routes(), "GET", path, "", "")
		if r.Code != 200 {
			t.Fatal(r.Code, r.Body.String())
		}
		for _, private := range []string{c.cfg.PlexToken, c.cfg.MusicRoot, "/private/audio"} {
			if strings.Contains(r.Body.String(), private) {
				t.Fatal("private data exposed")
			}
		}
		var p page
		if err := json.Unmarshal(r.Body.Bytes(), &p); err != nil {
			t.Fatal(err)
		}
		return p
	}
	base := "/api/radio/palac-feel/history?limit=2&from=" + url.QueryEscape(now.Add(-time.Hour).Format(time.RFC3339))
	p := read(base)
	if len(p.Items) != 2 || p.Next == nil || p.Stage != "palac-feel" {
		t.Fatal(p)
	}
	p2 := read(base + "&before=" + url.QueryEscape(*p.Next) + "&until=" + url.QueryEscape(p.Until))
	if len(p2.Items) != 1 || p2.Next != nil {
		t.Fatal("tied timestamps skipped or repeated", p2)
	}
	if p := read("/api/radio/palac-feel/history"); len(p.Items) != 4 {
		t.Fatal(p)
	}
	for _, bound := range []struct {
		from, until time.Time
		count       int
	}{
		{now, now.Add(time.Millisecond), 3},
		{now.Add(time.Microsecond), now.Add(time.Millisecond), 0},
		{now.Add(-time.Millisecond), now, 0},
		{now.Add(-time.Millisecond), now.Add(time.Microsecond), 3},
	} {
		q := url.Values{"from": {bound.from.Format(time.RFC3339Nano)}, "until": {bound.until.Format(time.RFC3339Nano)}}
		if p := read("/api/radio/palac-feel/history?" + q.Encode()); len(p.Items) != bound.count {
			t.Fatalf("fractional bounds %v: %d starts", bound, len(p.Items))
		}
	}
	r := request(c.routes(), "GET", "/api/radio/palac-feel/music", "", "")
	var stats struct {
		Tracks, Plays, DistinctPlayed, Unplayed int
		Top                                     []playedCount
		Earliest                                *string
	}
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &stats) != nil {
		t.Fatal(r.Body.String())
	}
	if stats.Tracks != 2 || stats.Plays != 3 || stats.DistinctPlayed != 1 || stats.Unplayed != 1 || len(stats.Top) != 1 || stats.Top[0].Plays != 3 || stats.Earliest == nil {
		t.Fatal(stats)
	}
	for _, path := range []string{"history?limit=1", "music"} {
		w := &databaseResponseWriter{httptest.NewRecorder(), c.db, t}
		c.routes().ServeHTTP(w, httptest.NewRequest("GET", "/api/radio/palac-feel/"+path, nil))
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	for _, q := range []string{"limit=0", "limit=101", "limit=x", "from=tomorrow", "from=1960-01-01T00:00:00Z", "until=1970-01-01T00:00:00Z", "before=2", "before=1:-2", "before=a:2", "before=99999999999999999999:1"} {
		if r := request(c.routes(), "GET", "/api/radio/palac-feel/history?"+q, "", ""); r.Code != 400 {
			t.Fatal(q, r.Code)
		}
	}
	other := testControllerStage(t, "ambiance")
	r = request(other.routes(), "GET", "/api/radio/ambiance/history", "", "")
	if r.Code != 200 || !strings.Contains(r.Body.String(), `"items":[]`) {
		t.Fatal("history crossed stages")
	}
	if r := request(other.routes(), "GET", "/api/radio/palac-feel/history", "", ""); r.Code != 404 {
		t.Fatal(r.Code)
	}
	c.db.Close()
	for _, path := range []string{"history", "music"} {
		if r := request(c.routes(), "GET", "/api/radio/palac-feel/"+path, "", ""); r.Code != 503 {
			t.Fatal("database failure hidden", r.Code)
		}
	}
}

type databaseResponseWriter struct {
	*httptest.ResponseRecorder
	db *sql.DB
	t  *testing.T
}

func (w *databaseResponseWriter) Write(data []byte) (int, error) {
	if w.db.Stats().InUse != 0 {
		w.t.Error("response write holds a database connection")
	}
	return w.ResponseRecorder.Write(data)
}
