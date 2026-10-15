package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func testController(t *testing.T) *controller {
	t.Helper()
	return testControllerStage(t, "")
}

func testControllerStage(t *testing.T, stage string) *controller {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, "music")
	if err := os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	c, err := openController(config{Stage: stage, StateDir: filepath.Join(base, "state"), MusicRoot: root, InternalToken: "internal-secret-token", PlexToken: "plex-secret-token", PlexURL: "http://plex.invalid", IcecastURL: "http://icecast.invalid"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.db.Close() })
	return c
}

func addTrack(t *testing.T, c *controller, id, artist string) track {
	t.Helper()
	tr := track{ID: id, Title: "Titre " + id, Artist: artist, Path: filepath.Join(c.cfg.MusicRoot, id+".mp3"), Duration: 180000}
	if err := os.WriteFile(tr.Path, []byte("audio fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := c.db.Exec("INSERT INTO tracks(id,title,artist,path,duration) VALUES(?,?,?,?,?)", tr.ID, tr.Title, tr.Artist, tr.Path, tr.Duration); err != nil {
		t.Fatal(err)
	}
	return tr
}

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func reply(r *http.Request, status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}
}
func xmlEscape(s string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}
func plexPage(start, total int, ts []track) string {
	var b strings.Builder
	fmt.Fprintf(&b, `<MediaContainer size="%d" totalSize="%d" offset="%d">`, len(ts), total, start)
	for _, tr := range ts {
		fmt.Fprintf(&b, `<Track ratingKey="%s" title="%s" grandparentTitle="%s" duration="%d"><Media><Part file="%s"/></Media></Track>`, tr.ID, xmlEscape(tr.Title), xmlEscape(tr.Artist), tr.Duration, xmlEscape(tr.Path))
	}
	b.WriteString("</MediaContainer>")
	return b.String()
}

func selected(uri string) (string, string) {
	id := regexp.MustCompile(`pavoia_id="([0-9]+)"`).FindStringSubmatch(uri)
	event := regexp.MustCompile(`pavoia_event="([A-Za-z0-9_-]+)"`).FindStringSubmatch(uri)
	if len(id) != 2 || len(event) != 2 {
		return "", ""
	}
	return id[1], event[1]
}
func queryCount(t *testing.T, c *controller, table string) int {
	t.Helper()
	var count int
	if err := c.db.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestScenesSeparatePlaylistHistoryAudienceAndRoutes(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Millisecond).Add(-10 * time.Second)
	feel, dance := testController(t), testControllerStage(t, "palac-dance")
	if feel.cfg.StateDir == dance.cfg.StateDir {
		t.Fatal("scene fixtures share state")
	}
	for _, tc := range []struct {
		c                         *controller
		id, name, playlist, other string
		listeners                 int
	}{
		{feel, "palac-feel", "Palac Feel", "146686", "palac-dance", 2},
		{dance, "palac-dance", "Palac Dance", "145470", "palac-feel", 7},
	} {
		tr := addTrack(t, tc.c, "1", tc.name)
		tr.Title = tc.name + " title"
		playlistCalls, audienceCalls := 0, 0
		tc.c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
			switch r.URL.Path {
			case "/playlists/" + tc.playlist + "/items":
				playlistCalls++
				if r.Header.Get("X-Plex-Token") != tc.c.cfg.PlexToken {
					t.Error("missing Plex header token")
				}
				return reply(r, 200, plexPage(0, 1, []track{tr})), nil
			case "/status-json.xsl":
				audienceCalls++
				return reply(r, 200, `{"icestats":{"source":[{"listenurl":"http://icecast/palac-feel.mp3","listeners":2},{"listenurl":"http://icecast/palac-dance.mp3","listeners":7}]}}`), nil
			default:
				t.Errorf("%s requested unexpected path %s", tc.id, r.URL.Path)
				return reply(r, 404, ""), nil
			}
		})
		if err := tc.c.syncPlaylist(ctx); err != nil {
			t.Fatal(err)
		}
		for _, at := range []time.Time{now, now.Add(10 * time.Second)} {
			if err := tc.c.pollAudience(ctx, at); err != nil {
				t.Fatal(err)
			}
		}
		if playlistCalls != 1 || audienceCalls != 2 {
			t.Fatal("scene did not fetch its playlist and audience")
		}
		h := tc.c.routes()
		body := fmt.Sprintf(`{"id":"1","event":"same-event","startedAt":"%s"}`, now.Format(time.RFC3339Nano))
		for i := 0; i < 2; i++ {
			if w := request(h, "POST", "/internal/played", tc.c.cfg.InternalToken, body); w.Code != 204 {
				t.Fatalf("%s callback returned %d", tc.id, w.Code)
			}
		}
		if queryCount(t, tc.c, "playback") != 1 {
			t.Fatal("same event was not independently idempotent")
		}
		if tc.c == feel && (queryCount(t, dance, "playback") != 0 || queryCount(t, dance, "samples") != 0) {
			t.Fatal("Feel callback or audience crossed into Dance")
		}
		w := request(h, "GET", "/api/radio/"+tc.id, "", "")
		var status radioStatus
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &status) != nil {
			t.Fatal("scene status unavailable")
		}
		if status.Stage.ID != tc.id || status.Stage.Name != tc.name || status.StreamURL != "/stream/"+tc.id+".mp3" || status.Track == nil || status.Track.Title != tr.Title || status.Audience.Listeners == nil || *status.Audience.Listeners != tc.listeners {
			t.Fatalf("%s returned another scene's state: %+v", tc.id, status)
		}
		for _, private := range []string{tc.c.cfg.PlexToken, tc.c.cfg.InternalToken, tc.c.cfg.MusicRoot} {
			if strings.Contains(w.Body.String(), private) {
				t.Fatal("scene status exposes private configuration")
			}
		}
		w = request(h, "GET", "/api/radio/"+tc.id+"/stats", "", "")
		var stats statsStatus
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &stats) != nil || stats.Totals.Peak == nil || *stats.Totals.Peak != tc.listeners || stats.Totals.MeasuredSeconds == nil || *stats.Totals.MeasuredSeconds != 10 || stats.Totals.ListenerHours == nil || math.Abs(*stats.Totals.ListenerHours-float64(tc.listeners)*10/3600) > 1e-9 {
			t.Fatalf("%s counters crossed scenes: %s", tc.id, w.Body.String())
		}
		for _, suffix := range []string{"", "/stats"} {
			if w := request(h, "GET", "/api/radio/"+tc.other+suffix, "", ""); w.Code != 404 {
				t.Fatalf("%s serves %s%s with %d", tc.id, tc.other, suffix, w.Code)
			}
		}
	}
	var title string
	if err := feel.db.QueryRow("SELECT title FROM playback WHERE event='same-event'").Scan(&title); err != nil || title != "Palac Feel title" {
		t.Fatal("Dance callback replaced Feel history")
	}
}

func TestIcecastSelectsOnlyRequestedMount(t *testing.T) {
	mixed := []byte(`{"icestats":{"source":[{"listenurl":"http://icecast/palac-feel.mp3","listeners":2},{"listenurl":"http://icecast/palac-dance.mp3","listeners":7}]}}`)
	for _, tc := range []struct {
		mount string
		want  int
	}{{"/palac-feel.mp3", 2}, {"/palac-dance.mp3", 7}} {
		n, err := icecastListeners(mixed, tc.mount)
		if err != nil || n == nil || *n != tc.want {
			t.Fatalf("mount %s: %v, %v", tc.mount, n, err)
		}
	}
	feelOnly := []byte(`{"icestats":{"source":{"listenurl":"http://icecast/palac-feel.mp3","listeners":2}}}`)
	if n, err := icecastListeners(feelOnly, "/palac-dance.mp3"); err != nil || n != nil {
		t.Fatal("missing Dance mount borrowed Feel audience")
	}
	duplicate := []byte(`{"icestats":{"source":[{"listenurl":"http://icecast/palac-dance.mp3","listeners":1},{"listenurl":"http://icecast/palac-dance.mp3","listeners":2}]}}`)
	if _, err := icecastListeners(duplicate, "/palac-dance.mp3"); err == nil {
		t.Fatal("ambiguous Dance mount counts accepted")
	}
}

func TestPlaylistPaginationAtomicityEmptyAndRedirects(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	ts := []track{}
	for i := 1; i <= 3; i++ {
		ts = append(ts, addTrack(t, c, strconv.Itoa(i), "Artist"))
	}
	ts[0].Title = "Title " + c.cfg.PlexToken + " " + c.cfg.InternalToken + " " + ts[0].Path
	c.pageSize = 2
	calls := 0
	failSecond := false
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("X-Plex-Token") != c.cfg.PlexToken || strings.Contains(r.URL.String(), c.cfg.PlexToken) {
			t.Error("token must be sent only in header")
		}
		if r.URL.Path != "/playlists/146686/items" {
			t.Error("wrong playlist")
		}
		start, _ := strconv.Atoi(r.URL.Query().Get("X-Plex-Container-Start"))
		if start == 2 && failSecond {
			return reply(r, 503, "failure"), nil
		}
		stop := min(start+2, len(ts))
		return reply(r, 200, plexPage(start, len(ts), ts[start:stop])), nil
	})
	if err := c.syncPlaylist(ctx); err != nil {
		t.Fatal(err)
	}
	if calls != 2 || queryCount(t, c, "tracks") != 3 {
		t.Fatal("complete pages were not imported")
	}
	var cachedTitle string
	if err := c.db.QueryRow("SELECT title FROM tracks WHERE id='1'").Scan(&cachedTitle); err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{c.cfg.PlexToken, c.cfg.InternalToken, c.cfg.MusicRoot, "/1.mp3"} {
		if strings.Contains(cachedTitle, private) {
			t.Fatalf("unsanitized cached title: %q", cachedTitle)
		}
	}
	before, err := os.ReadFile(filepath.Join(c.cfg.StateDir, "fallback.m3u"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(before), "pavoia_event") {
		t.Fatal("fallback must not reuse event IDs")
	}
	failSecond = true
	ts[0].Title = "Must not replace cache"
	if err := c.syncPlaylist(ctx); err == nil {
		t.Fatal("partial import accepted")
	}
	after, _ := os.ReadFile(filepath.Join(c.cfg.StateDir, "fallback.m3u"))
	if !bytes.Equal(before, after) {
		t.Fatal("failed import changed fallback")
	}
	var title string
	if err = c.db.QueryRow("SELECT title FROM tracks WHERE id='1'").Scan(&title); err != nil || title == ts[0].Title {
		t.Fatal("partial import replaced DB")
	}
	for name, body := range map[string]string{
		"missing total":   `<MediaContainer size="0"/>`,
		"mismatched size": `<MediaContainer size="1" totalSize="0"/>`,
		"premature end":   `<MediaContainer size="0" totalSize="2"/>`,
		"wrong XML":       `<Other size="0" totalSize="0"/>`,
		"duplicate ID":    plexPage(0, 2, []track{ts[0], ts[0]}),
	} {
		t.Run(name, func(t *testing.T) {
			c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) { return reply(r, 200, body), nil })
			if err := c.syncPlaylist(ctx); err == nil {
				t.Fatal("invalid pagination accepted")
			}
			if queryCount(t, c, "tracks") != 3 {
				t.Fatal("cache lost")
			}
		})
	}
	calls = 0
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		res := reply(r, 302, "")
		res.Header.Set("Location", "http://other.invalid/secret")
		return res, nil
	})
	if err = c.syncPlaylist(ctx); err == nil || calls != 1 {
		t.Fatal("redirect followed or accepted")
	}
	savedRoot := c.cfg.MusicRoot
	c.cfg.MusicRoot = filepath.Join(t.TempDir(), "missing")
	if err = c.syncPlaylist(ctx); err == nil {
		t.Fatal("missing mount treated as empty playlist")
	}
	c.cfg.MusicRoot = savedRoot
	if queryCount(t, c, "tracks") != 3 {
		t.Fatal("missing mount erased cache")
	}
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) { return reply(r, 200, plexPage(0, 0, nil)), nil })
	if err = c.syncPlaylist(ctx); err != nil {
		t.Fatal(err)
	}
	if queryCount(t, c, "tracks") != 0 || queryCount(t, c, "cycle") != 0 {
		t.Fatal("valid empty playlist retained tracks")
	}
	data, _ := os.ReadFile(filepath.Join(c.cfg.StateDir, "fallback.m3u"))
	if string(data) != "#EXTM3U\n" {
		t.Fatal("empty fallback not exported")
	}
	if enabled, err := c.enabled(ctx); err != nil || enabled {
		t.Fatal("empty stage remains enabled")
	}
}

func TestMusicContainmentAndAnnotation(t *testing.T) {
	c := testController(t)
	tr := addTrack(t, c, "1", "Artist")
	outside := filepath.Join(t.TempDir(), "escape.mp3")
	if err := os.WriteFile(outside, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(c.cfg.MusicRoot, "escape.mp3")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{outside, link, filepath.Join(c.cfg.MusicRoot, "../escape.mp3"), c.cfg.MusicRoot, tr.Path + "\n"} {
		if c.playable(path) == nil {
			t.Errorf("accepted invalid path %q", path)
		}
	}
	alias := filepath.Join(filepath.Dir(c.cfg.MusicRoot), "alias")
	if err := os.Symlink(c.cfg.MusicRoot, alias); err != nil {
		t.Fatal(err)
	}
	logical, err := c.logicalPath(filepath.Join(alias, "1.mp3"))
	if err != nil || logical != tr.Path {
		t.Fatalf("physical alias not normalized: %q %v", logical, err)
	}
	tr.Title = `Été, "live": C:\music`
	tr.Artist = "AC/DC"
	tr.Path = filepath.Join(c.cfg.MusicRoot, `Été, "live":.mp3`)
	uri, err := annotated(tr, "event_1")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(uri, `title="Été, \"live\": C:\\music"`) || !strings.HasSuffix(uri, ":"+tr.Path) {
		t.Fatalf("incorrect escaping %q", uri)
	}
	tr.Title = "bad\nmetadata"
	if _, err = annotated(tr, ""); err == nil {
		t.Fatal("annotation newline accepted")
	}
}

func TestSchedulingActualStartsRestartAndArtists(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	now := time.Now().UTC()
	for i, a := range []string{"A", "B", "C", "A", "D"} {
		tr := addTrack(t, c, strconv.Itoa(i+1), a)
		if i < 3 {
			if err := c.played(ctx, tr.ID, "prior"+tr.ID, now.Add(time.Duration(i-3)*time.Minute)); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := c.db.Exec("INSERT INTO cycle(id,rank) VALUES(?,?)", tr.ID, i); err != nil {
			t.Fatal(err)
		}
	}
	uri, err := c.next(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	id, event := selected(uri)
	if id != "5" {
		t.Fatalf("last three artists not avoided: %q", uri)
	}
	if queryCount(t, c, "playback") != 3 || queryCount(t, c, "reservations") != 1 {
		t.Fatal("reservation counted as actual playback")
	}
	listeners := 2
	if err = c.recordAudience(ctx, now, &listeners); err != nil {
		t.Fatal(err)
	}
	if err = c.db.Close(); err != nil {
		t.Fatal(err)
	}
	c2, err := openController(c.cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer c2.db.Close()
	audience, err := c2.audience(ctx, now)
	if err != nil || !audience.Available || audience.Listeners == nil || *audience.Listeners != 2 {
		t.Fatal("audience sample lost at restart")
	}
	uri, err = c2.next(ctx, now.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	second, _ := selected(uri)
	if second == id || second == "" {
		t.Fatal("restart repeated reserved track")
	}
	if err = c2.played(ctx, id, event, now); err != nil {
		t.Fatal(err)
	}
	if err = c2.played(ctx, id, event, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err = c2.played(ctx, "1", event, now); err == nil {
		t.Fatal("same event reused for another track")
	}
	var actual int64
	if err = c2.db.QueryRow("SELECT started_at FROM playback WHERE event=?", event).Scan(&actual); err != nil || actual != now.UnixMilli() {
		t.Fatal("retry changed actual start")
	}
	if queryCount(t, c2, "playback") != 4 {
		t.Fatal("callbacks not idempotent")
	}
}

func TestCycleSurvivesRefreshWithoutRepeats(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	now := time.Now().UTC()
	ts := []track{}
	for i := 1; i <= 8; i++ {
		ts = append(ts, addTrack(t, c, strconv.Itoa(i), fmt.Sprintf("Artist%d", i)))
	}
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) { return reply(r, 200, plexPage(0, len(ts), ts)), nil })
	if err := c.syncPlaylist(ctx); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for i := 0; i < len(ts); i++ {
		uri, err := c.next(ctx, now.Add(time.Duration(i)*time.Second))
		if err != nil {
			t.Fatal(err)
		}
		id, event := selected(uri)
		if seen[id] || id == "" {
			t.Fatalf("cycle repeated %q", id)
		}
		seen[id] = true
		if err = c.played(ctx, id, event, now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
		if err = c.syncPlaylist(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if len(seen) != len(ts) {
		t.Fatal("cycle incomplete")
	}
	if uri, err := c.next(ctx, now.Add(time.Minute)); err != nil || uri == "" {
		t.Fatal("new cycle did not begin")
	}
}

func TestMissingFilesBoundedAndConcurrentReservations(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	now := time.Now().UTC()
	for i := 1; i <= 34; i++ {
		tr := addTrack(t, c, strconv.Itoa(i), "Artist")
		if i < 34 {
			if err := os.Remove(tr.Path); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := c.db.Exec("INSERT INTO cycle(id,rank) VALUES(?,?)", tr.ID, i); err != nil {
			t.Fatal(err)
		}
	}
	if uri, err := c.next(ctx, now); err != nil || uri != "" {
		t.Fatal("bounded missing-file pass must stop after 32")
	}
	uri, err := c.next(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := selected(uri)
	if id != "34" {
		t.Fatal("later playable selection not recovered")
	}
	c2 := testController(t)
	for i := 1; i <= 20; i++ {
		addTrack(t, c2, strconv.Itoa(i), fmt.Sprintf("Artist%d", i))
	}
	var wg sync.WaitGroup
	results := make(chan string, 20)
	errs := make(chan error, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			uri, err := c2.next(ctx, time.Now().UTC())
			if err != nil {
				errs <- err
			}
			id, _ := selected(uri)
			results <- id
		}()
	}
	wg.Wait()
	close(results)
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	seen := map[string]bool{}
	for id := range results {
		if id == "" || seen[id] {
			t.Errorf("concurrent reservation repeated %q", id)
		}
		seen[id] = true
	}
	if queryCount(t, c2, "playback") != 0 {
		t.Fatal("requests recorded as playback")
	}
}

func TestAudienceZeroGapsMidnightAndUnavailable(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	start := time.Date(2026, 10, 5, 23, 59, 55, 0, time.UTC)
	zero, two, ten := 0, 2, 10
	for _, sample := range []struct {
		seconds int
		n       *int
	}{{0, &two}, {10, &zero}, {20, nil}, {30, &ten}, {60, &two}, {70, &zero}} {
		if err := c.recordAudience(ctx, start.Add(time.Duration(sample.seconds)*time.Second), sample.n); err != nil {
			t.Fatal(err)
		}
	}
	stats, err := c.stats(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(stats.Days) != 2 || *stats.Totals.MeasuredSeconds != 20 || math.Abs(*stats.Totals.ListenerHours-20.0/3600) > 1e-9 || *stats.Totals.Peak != 10 {
		t.Fatalf("gaps or midnight integration incorrect: %+v", stats)
	}
	if stats.Days[0].MeasuredSeconds != 5 || stats.Days[1].MeasuredSeconds != 15 {
		t.Fatal("midnight interval not split")
	}
	state, err := c.audience(ctx, start.Add(70*time.Second))
	if err != nil || !state.Available || state.Listeners == nil || *state.Listeners != 0 {
		t.Fatal("zero confused with unavailable")
	}
	state, err = c.audience(ctx, start.Add(91*time.Second))
	if err != nil || state.Available || state.Listeners != nil {
		t.Fatal("stale sample advertised")
	}
	for _, tc := range []struct {
		body string
		want *int
		fail bool
	}{
		{`{"icestats":{"source":{"listenurl":"http://icecast/palac-feel.mp3","listeners":0}}}`, &zero, false},
		{`{"icestats":{"source":[{"listenurl":"http://icecast/other.mp3","listeners":999},{"listenurl":"http://icecast/palac-feel.mp3","listeners":2}]}}`, &two, false},
		{`{"icestats":{"source":{"listenurl":"http://icecast/other.mp3","listeners":999}}}`, nil, false},
		{`{"icestats":{"source":{"listenurl":"http://icecast/palac-feel.mp3"}}}`, nil, true},
		{`{"icestats":{"source":{"listenurl":"http://icecast/palac-feel.mp3","listeners":-1}}}`, nil, true},
	} {
		n, err := icecastListeners([]byte(tc.body), "/palac-feel.mp3")
		if (err != nil) != tc.fail || (n == nil) != (tc.want == nil) || (n != nil && *n != *tc.want) {
			t.Fatalf("bad mount parser: %s %v %v", tc.body, n, err)
		}
	}
	c.client.Transport = transportFunc(func(*http.Request) (*http.Response, error) { return nil, errors.New("network failure") })
	if err = c.pollAudience(ctx, start.Add(80*time.Second)); err == nil {
		t.Fatal("poll failure hidden")
	}
	state, _ = c.audience(ctx, start.Add(80*time.Second))
	if state.Available || state.Listeners != nil {
		t.Fatal("poll failure replaced with zero")
	}
}

func request(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestPublicRedactionAuthActualTimeAndStaleCurrent(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	now := time.Now().UTC()
	tr := addTrack(t, c, "1", "Artist")
	tr.Title = c.cfg.PlexToken + " " + c.cfg.InternalToken + " /home/private/library/file.mp3\nTitle"
	if _, err := c.db.Exec("UPDATE tracks SET title=? WHERE id='1'", tr.Title); err != nil {
		t.Fatal(err)
	}
	if _, err := c.db.Exec("INSERT INTO state(key,value) VALUES('last_sync',?)", now.Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	h := c.routes()
	for _, path := range []string{"/internal/next", "/internal/enabled"} {
		if w := request(h, "GET", path, "", ""); w.Code != 401 {
			t.Fatal("private read unauthenticated")
		}
	}
	for _, path := range []string{"/internal/sync", "/internal/played"} {
		if w := request(h, "POST", path, "", ""); w.Code != 401 {
			t.Fatal("private write unauthenticated")
		}
	}
	if w := request(h, "GET", "/internal/enabled", c.cfg.InternalToken, ""); w.Code != 200 || w.Body.String() != "true\n" {
		t.Fatal("enabled state missing")
	}
	started := now.Add(-time.Minute).Truncate(time.Second)
	body := fmt.Sprintf(`{"id":"1","event":"event1","startedAt":"%s"}`, started.Format(time.RFC3339))
	if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, body); w.Code != 204 {
		t.Fatalf("callback failed: %d", w.Code)
	}
	zero := 0
	if err := c.recordAudience(ctx, now, &zero); err != nil {
		t.Fatal(err)
	}
	w := request(h, "GET", "/api/radio/palac-feel", "", "")
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	for _, secret := range []string{c.cfg.PlexToken, c.cfg.InternalToken, c.cfg.MusicRoot, "/home/private/library/file.mp3", "audio fixture"} {
		if strings.Contains(w.Body.String(), secret) {
			t.Fatalf("public metadata leak: %s", secret)
		}
	}
	var status radioStatus
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	if status.Track == nil || status.Track.StartedAt != started.Format(time.RFC3339) || status.Audience.Listeners == nil || *status.Audience.Listeners != 0 {
		t.Fatal("actual start or zero missing")
	}
	for _, date := range []string{now.Add(-49 * time.Hour).Format(time.RFC3339), now.Add(time.Minute).Format(time.RFC3339), "bad"} {
		body := fmt.Sprintf(`{"id":"1","event":"new","startedAt":"%s"}`, date)
		if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, body); w.Code != 400 {
			t.Fatal("unbounded start time accepted")
		}
	}
	if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, body+"{}"); w.Code != 400 {
		t.Fatal("trailing body accepted")
	}
	if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, strings.Repeat("x", 5000)); w.Code != 400 {
		t.Fatal("oversized body accepted")
	}
	if err := c.recordAudience(ctx, now.Add(time.Millisecond), nil); err != nil {
		t.Fatal(err)
	}
	w = request(h, "GET", "/api/radio/palac-feel", "", "")
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil || status.Track != nil {
		t.Fatal("mount unavailable retains current track")
	}
	if w := request(h, "GET", "/radio.sqlite", "", ""); w.Code != 404 {
		t.Fatal("arbitrary state accessible")
	}
	if w := request(h, "GET", "/web/", "", ""); w.Code != 404 {
		t.Fatal("directory listing")
	}
	if w := request(h, "GET", "/", "", ""); w.Code != 200 {
		t.Fatal("embed missing")
	}
	if err := c.db.Close(); err != nil {
		t.Fatal(err)
	}
	w = request(h, "GET", "/api/radio/palac-feel/stats", "", "")
	if w.Code != 503 || !strings.Contains(w.Body.String(), `"peak":null`) || !strings.Contains(w.Body.String(), `"listenerHours":null`) || !strings.Contains(w.Body.String(), `"available":false`) {
		t.Fatal("stats DB failure invented zeros")
	}
	if w := request(h, "GET", "/healthz", "", ""); w.Code != 503 {
		t.Fatal("DB health failure hidden")
	}
}

func TestBackupRetentionRawExpiryAndRestore(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	tr := addTrack(t, c, "1", "Artist")
	now := time.Now().UTC()
	n := 2
	if err := c.recordAudience(ctx, now.AddDate(0, 0, -31), &n); err != nil {
		t.Fatal(err)
	}
	if err := c.recordAudience(ctx, now.Add(-time.Second), &n); err != nil {
		t.Fatal(err)
	}
	if err := c.played(ctx, tr.ID, "start", now); err != nil {
		t.Fatal(err)
	}
	if err := c.maintain(ctx, now); err != nil {
		t.Fatal(err)
	}
	if queryCount(t, c, "samples") != 1 || queryCount(t, c, "daily") != 2 {
		t.Fatal("raw retention deleted aggregates or retained expired samples")
	}
	path := filepath.Join(c.cfg.StateDir, "backups", now.Format("2006-01-02")+".sqlite")
	backup, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if err = backup.QueryRow("SELECT COUNT(*) FROM playback").Scan(&count); err != nil || count != 1 {
		t.Fatal("backup inconsistent")
	}
	_ = backup.Close()
	for i := 1; i <= 8; i++ {
		if err := c.maintain(ctx, now.AddDate(0, 0, i)); err != nil {
			t.Fatal(err)
		}
	}
	files, err := filepath.Glob(filepath.Join(c.cfg.StateDir, "backups", "*.sqlite"))
	if err != nil || len(files) != 7 {
		t.Fatal("backup retention must retain seven")
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("oldest backup retained")
	}
}

func TestConfigRequiresSecretsAndLoopback(t *testing.T) {
	t.Setenv("PAVOIA_STATE_DIR", t.TempDir())
	t.Setenv("PAVOIA_MUSIC_ROOT", t.TempDir())
	t.Setenv("PAVOIA_PLEX_TOKEN", "plex-secret")
	t.Setenv("PAVOIA_INTERNAL_TOKEN", "internal-secret")
	t.Setenv("PAVOIA_PLEX_URL", "http://127.0.0.1:31711")
	t.Setenv("PAVOIA_ICECAST_URL", "http://127.0.0.1:14501")
	t.Setenv("PAVOIA_LISTEN", "127.0.0.1:14502")
	t.Setenv("PAVOIA_STAGE", "")
	if _, err := loadConfig(); err != nil {
		t.Fatal(err)
	}
	for _, address := range []string{"0.0.0.0:14502", "[::]:14502", ":14502", "localhost:14502", "127.0.0.1:0"} {
		t.Setenv("PAVOIA_LISTEN", address)
		if _, err := loadConfig(); err == nil {
			t.Fatalf("accepted public/ambiguous bind %q", address)
		}
	}
	t.Setenv("PAVOIA_LISTEN", "127.0.0.1:14502")
	t.Setenv("PAVOIA_INTERNAL_TOKEN", "")
	if _, err := loadConfig(); err == nil {
		t.Fatal("missing internal secret accepted")
	}
}

func TestConfigRejectsUnknownStage(t *testing.T) {
	t.Setenv("PAVOIA_STATE_DIR", t.TempDir())
	t.Setenv("PAVOIA_MUSIC_ROOT", t.TempDir())
	t.Setenv("PAVOIA_PLEX_TOKEN", "plex-secret")
	t.Setenv("PAVOIA_INTERNAL_TOKEN", "internal-secret")
	t.Setenv("PAVOIA_PLEX_URL", "http://127.0.0.1:31711")
	t.Setenv("PAVOIA_ICECAST_URL", "http://127.0.0.1:14501")
	t.Setenv("PAVOIA_LISTEN", "127.0.0.1:14502")
	for _, id := range []string{"", "palac-feel", "palac-dance", "bermuda-day", "bermuda-evening", "essentials", "etage-zero", "fontanna", "ambiance", "closing"} {
		t.Setenv("PAVOIA_STAGE", id)
		cfg, err := loadConfig()
		want := id
		if want == "" {
			want = "palac-feel"
		}
		if err != nil || cfg.Stage != want {
			t.Fatalf("scene %q: config %+v, error %v", id, cfg, err)
		}
	}
	fontanna, err := sceneFor("fontanna")
	if err != nil || strings.Join(fontanna.PlaylistIDs, ",") != "145469,162633" {
		t.Fatalf("wrong Fontanna playlist: %+v, %v", fontanna, err)
	}
	for _, id := range []string{"unknown", "Palac-Feel", " palac-dance", "palac-dance/"} {
		t.Setenv("PAVOIA_STAGE", id)
		if _, err := loadConfig(); err == nil {
			t.Errorf("accepted unknown scene %q", id)
		}
	}
	state := filepath.Join(t.TempDir(), "state")
	if c, err := openController(config{Stage: "unknown", StateDir: state}); err == nil {
		_ = c.db.Close()
		t.Fatal("direct controller configuration accepted an unknown scene")
	}
	if _, err := os.Stat(state); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("invalid scene created state")
	}
}

func TestQueuedCallbackPreservesNewCycleSlot(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	now := time.Now().UTC()
	addTrack(t, c, "1", "same")
	addTrack(t, c, "2", "same")
	first, err := c.next(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	firstID, firstEvent := selected(first)
	second, err := c.next(ctx, now.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	secondID, secondEvent := selected(second)
	if err = c.played(ctx, firstID, firstEvent, now); err != nil {
		t.Fatal(err)
	}
	third, err := c.next(ctx, now.Add(2*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	thirdID, _ := selected(third)
	if thirdID != firstID {
		t.Fatalf("expected sole unreserved track %s, got %s", firstID, thirdID)
	}
	if err = c.db.Close(); err != nil {
		t.Fatal(err)
	}
	restarted, err := openController(c.cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.db.Close()
	if err = restarted.played(ctx, secondID, secondEvent, now.Add(3*time.Second)); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = restarted.db.QueryRow("SELECT COUNT(*) FROM cycle WHERE id=?", secondID).Scan(&count); err != nil || count != 1 {
		t.Fatal("prior-cycle callback consumed new-cycle slot")
	}
	fourth, err := restarted.next(ctx, now.Add(4*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	fourthID, _ := selected(fourth)
	if fourthID != secondID {
		t.Fatalf("new cycle lost track %s, selected %s", secondID, fourthID)
	}
}

func TestLateFallbackPreservesNewCycleSlot(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	now := time.Now().UTC()
	addTrack(t, c, "1", "same")
	addTrack(t, c, "2", "same")
	for i := 0; i < 2; i++ {
		uri, err := c.next(ctx, now.Add(time.Duration(i)*time.Second))
		if err != nil {
			t.Fatal(err)
		}
		id, event := selected(uri)
		if err = c.played(ctx, id, event, now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}
	uri, err := c.next(ctx, now.Add(10*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	queuedID, _ := selected(uri)
	remainingID := "1"
	if queuedID == remainingID {
		remainingID = "2"
	}
	var created int64
	if err = c.db.QueryRow("SELECT created_at FROM cycle WHERE id=?", remainingID).Scan(&created); err != nil {
		t.Fatal(err)
	}
	if err = c.played(ctx, remainingID, "late-fallback", time.UnixMilli(created).Add(-time.Second)); err != nil {
		t.Fatal(err)
	}
	if queryCount(t, c, "cycle") != 1 {
		t.Fatal("old fallback callback consumed newer cycle slot")
	}
	if err = c.played(ctx, remainingID, "current-fallback", time.UnixMilli(created).Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if queryCount(t, c, "cycle") != 0 {
		t.Fatal("current fallback actual start did not consume its slot")
	}
	if err = c.played(ctx, remainingID, "late-fallback", now.Add(12*time.Second)); err != nil {
		t.Fatal(err)
	}
	if queryCount(t, c, "playback") != 4 {
		t.Fatal("fallback retries no longer idempotent")
	}
}

func TestDelayedFallbackSurvivesTrackRemoval(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	removed := addTrack(t, c, "1", "Removed artist")
	kept := addTrack(t, c, "2", "Current artist")
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		return reply(r, 200, plexPage(0, 1, []track{kept})), nil
	})
	started := time.Now().UTC().Add(-time.Minute)
	if err := c.syncPlaylist(ctx); err != nil {
		t.Fatal(err)
	}
	if queryCount(t, c, "tracks") != 1 || queryCount(t, c, "retired_tracks") != 1 {
		t.Fatal("removed record was not retained separately")
	}
	for i := 0; i < 2; i++ {
		if err := c.played(ctx, removed.ID, "fallback-before-removal", started); err != nil {
			t.Fatal(err)
		}
	}
	var title, artist, path string
	var duration, at int64
	if err := c.db.QueryRow("SELECT title,artist,path,duration,started_at FROM playback WHERE event='fallback-before-removal'").Scan(&title, &artist, &path, &duration, &at); err != nil {
		t.Fatal(err)
	}
	if title != removed.Title || artist != removed.Artist || path != removed.Path || duration != removed.Duration || at != started.UnixMilli() || queryCount(t, c, "playback") != 1 {
		t.Fatal("delayed callback lost metadata or idempotency")
	}
	if _, err := c.db.Exec("UPDATE retired_tracks SET retired_at=?", time.Now().Add(-97*time.Hour).UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if err := c.syncPlaylist(ctx); err != nil {
		t.Fatal(err)
	}
	if queryCount(t, c, "retired_tracks") != 0 {
		t.Fatal("retired metadata was retained beyond its retry window")
	}
	if err := c.played(ctx, removed.ID, "fallback-too-late", started); !errors.Is(err, errCallbackConflict) {
		t.Fatal(err)
	}
}

func TestFallbackBeforeBlockedRefillPreservesSlot(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	addTrack(t, c, "1", "same")
	addTrack(t, c, "2", "same")
	c.mu.Lock()
	entered := make(chan struct{})
	finished := make(chan string)
	failures := make(chan error, 1)
	go func() {
		requestAt := time.Now().UTC()
		close(entered)
		uri, err := c.next(ctx, requestAt)
		failures <- err
		finished <- uri
	}()
	<-entered
	time.Sleep(5 * time.Millisecond)
	actualFallbackStart := time.Now().UTC()
	time.Sleep(5 * time.Millisecond)
	unlocked := time.Now().UTC()
	c.mu.Unlock()
	uri := <-finished
	if err := <-failures; err != nil {
		t.Fatal(err)
	}
	queuedID, _ := selected(uri)
	remainingID := "1"
	if queuedID == remainingID {
		remainingID = "2"
	}
	var stored int64
	if err := c.db.QueryRow("SELECT created_at FROM cycle WHERE id=?", remainingID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored < unlocked.UnixMilli() {
		t.Fatal("slot timestamp predates mutex acquisition")
	}
	if err := c.played(ctx, remainingID, "late-before-refill", actualFallbackStart); err != nil {
		t.Fatal(err)
	}
	if queryCount(t, c, "cycle") != 1 {
		t.Fatal("fallback before blocked refill deleted new-cycle slot")
	}
}

func TestExistingCycleSchemaMigration(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	now := time.Now().UTC()
	addTrack(t, c, "1", "Artist")
	uri, err := c.next(ctx, now)
	if err != nil {
		t.Fatal(err)
	}
	id, event := selected(uri)
	if _, err = c.db.Exec("DROP TABLE cycle; CREATE TABLE cycle(id TEXT PRIMARY KEY,rank INTEGER NOT NULL); INSERT INTO cycle(id,rank) VALUES('1',0)"); err != nil {
		t.Fatal(err)
	}
	if err = c.db.Close(); err != nil {
		t.Fatal(err)
	}
	restarted, err := openController(c.cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.db.Close()
	if err = restarted.played(ctx, id, event, now); err != nil {
		t.Fatal(err)
	}
	if queryCount(t, restarted, "cycle") != 1 {
		t.Fatal("schema migration lost reserved/new-cycle slot")
	}
	var created int64
	if err = restarted.db.QueryRow("SELECT created_at FROM cycle WHERE id='1'").Scan(&created); err != nil || created == 0 {
		t.Fatal("legacy slot lacks conservative creation timestamp")
	}
}

func TestAbandonedReservationDoesNotBlockAvailableCycles(t *testing.T) {
	c := testController(t)
	ctx := context.Background()
	for i := 1; i <= 3; i++ {
		addTrack(t, c, strconv.Itoa(i), "Artist")
	}
	uri, err := c.next(ctx, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	abandonedID, _ := selected(uri)
	for cycle := 0; cycle < 3; cycle++ {
		if cycle == 2 {
			if err = c.db.Close(); err != nil {
				t.Fatal(err)
			}
			c, err = openController(c.cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer c.db.Close()
		}
		seen := map[string]bool{}
		for i := 0; i < 2; i++ {
			uri, err = c.next(ctx, time.Now().UTC())
			if err != nil {
				t.Fatal(err)
			}
			id, event := selected(uri)
			if id == "" {
				t.Fatalf("abandoned reservation blocked available cycle %d", cycle)
			}
			if id == abandonedID || seen[id] {
				t.Fatalf("cycle repeated or reused pending track %q", id)
			}
			seen[id] = true
			if err = c.played(ctx, id, event, time.Now().UTC()); err != nil {
				t.Fatal(err)
			}
		}
		if queryCount(t, c, "reservations") != 1 {
			t.Fatal("pending reservation was lost or reused")
		}
	}
}

func TestPlayedDistinguishesTerminalAndTransientFailures(t *testing.T) {
	c := testController(t)
	addTrack(t, c, "1", "Artist")
	h := c.routes()
	for _, tc := range []struct {
		body   string
		status int
	}{
		{`{"id":"../1","event":"event"}`, 400},
		{`{"id":"1","event":""}`, 400},
		{`{"id":"999","event":"unknown"}`, 409},
	} {
		if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, tc.body); w.Code != tc.status {
			t.Fatalf("terminal callback returned %d, want %d", w.Code, tc.status)
		}
	}
	if _, err := c.db.Exec(`CREATE TRIGGER fail_playback BEFORE INSERT ON playback BEGIN SELECT RAISE(FAIL,'simulated store failure'); END`); err != nil {
		t.Fatal(err)
	}
	valid := `{"id":"1","event":"valid"}`
	if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, valid); w.Code != 503 {
		t.Fatalf("write failure returned %d, want retryable 503", w.Code)
	}
	if queryCount(t, c, "playback") != 0 {
		t.Fatal("failed callback partially committed")
	}
	if _, err := c.db.Exec("DROP TRIGGER fail_playback"); err != nil {
		t.Fatal(err)
	}
	if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, valid); w.Code != 204 {
		t.Fatal("retry after store recovery failed")
	}
	if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, `{"id":"999","event":"valid"}`); w.Code != 409 {
		t.Fatal("event conflict should be terminal")
	}
	if w := request(h, "POST", "/internal/played", "", valid); w.Code != 401 {
		t.Fatal("authentication status changed")
	}
	if err := c.db.Close(); err != nil {
		t.Fatal(err)
	}
	if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, valid); w.Code != 503 {
		t.Fatal("database outage should be retryable")
	}
}

func TestPlayedHTTPPreservesSameSecondFraction(t *testing.T) {
	c := testController(t)
	addTrack(t, c, "1", "Artist")
	h := c.routes()
	created := time.Now().UTC().Add(-time.Second).Truncate(time.Second).Add(250 * time.Millisecond)
	actual := created.Add(250 * time.Millisecond)
	if _, err := c.db.Exec("INSERT INTO cycle(id,rank,created_at) VALUES('1',0,?)", created.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	wholeBody := fmt.Sprintf(`{"id":"1","event":"whole-second","startedAt":"%s"}`, actual.Format(time.RFC3339))
	if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, wholeBody); w.Code != 204 {
		t.Fatalf("whole-second callback returned %d", w.Code)
	}
	if queryCount(t, c, "cycle") != 1 {
		t.Fatal("truncated timestamp should predate this slot")
	}
	fractionalBody := fmt.Sprintf(`{"id":"1","event":"fractional","startedAt":"%s"}`, actual.Format(time.RFC3339Nano))
	if w := request(h, "POST", "/internal/played", c.cfg.InternalToken, fractionalBody); w.Code != 204 {
		t.Fatalf("fractional callback returned %d", w.Code)
	}
	if queryCount(t, c, "cycle") != 0 {
		t.Fatal("later same-second actual start did not consume its slot")
	}
	var stored int64
	if err := c.db.QueryRow("SELECT started_at FROM playback WHERE event='fractional'").Scan(&stored); err != nil || stored != actual.UnixMilli() {
		t.Fatal("HTTP callback lost fractional start precision")
	}
}
