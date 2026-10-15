package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestSelectionHistoryBaselineChangesRollbackAndPagination(t *testing.T) {
	c := testController(t)
	one := addTrack(t, c, "1", "One")
	two := addTrack(t, c, "2", "Two")
	// Fixtures create files and rows; the first synchronization establishes the real baseline.
	selection := []track{one}
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		return reply(r, 200, plexPage(0, len(selection), selection)), nil
	})
	read := func(query string) changesPage {
		t.Helper()
		response := request(c.routes(), "GET", "/api/radio/palac-feel/changes"+query, "", "")
		if response.Code != 200 {
			t.Fatal(response.Code, response.Body.String())
		}
		var page changesPage
		if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		for _, secret := range []string{c.cfg.PlexToken, c.cfg.MusicRoot} {
			if strings.Contains(response.Body.String(), secret) {
				t.Fatal("private data exposed")
			}
		}
		return page
	}
	if page := read(""); page.TrackingSince != nil || len(page.Changes) != 0 {
		t.Fatal("history invented before sync")
	}
	sync := func() {
		t.Helper()
		if err := c.syncPlaylist(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	sync()
	baseline := read("")
	if baseline.TrackingSince == nil || len(baseline.Changes) != 0 {
		t.Fatal("baseline invented changes")
	}
	selection = []track{one, two}
	sync()
	sync()
	page := read("")
	if len(page.Changes) != 1 || page.Changes[0].Kind != "added" || page.Changes[0].ID != "2" {
		t.Fatal(page)
	}
	// Metadata edits alone do not constitute additions.
	one.Title = "Updated title"
	selection = []track{one, two}
	sync()
	if len(read("").Changes) != 1 {
		t.Fatal("metadata edit recorded as membership change")
	}
	selection = []track{two}
	sync()
	page = read("")
	if len(page.Changes) != 2 || page.Changes[0].Kind != "removed" || page.Changes[0].Title != "Updated title" {
		t.Fatal(page)
	}
	// A database failure after recording proposed changes must roll back the journal too.
	if _, err := c.db.Exec("CREATE TRIGGER fail_track BEFORE INSERT ON tracks BEGIN SELECT RAISE(ABORT,'test failure'); END"); err != nil {
		t.Fatal(err)
	}
	selection = []track{one}
	if err := c.syncPlaylist(context.Background()); err == nil {
		t.Fatal("expected failed sync")
	}
	if len(read("").Changes) != 2 {
		t.Fatal("failed transaction changed history")
	}
	if _, err := c.db.Exec("DROP TRIGGER fail_track"); err != nil {
		t.Fatal(err)
	}
	selection = []track{one, two}
	sync()
	page = read("?limit=1")
	w := &databaseResponseWriter{httptest.NewRecorder(), c.db, t}
	c.routes().ServeHTTP(w, httptest.NewRequest("GET", "/api/radio/palac-feel/changes?limit=1", nil))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if len(page.Changes) != 1 || page.Changes[0].ID != "1" || page.Changes[0].Kind != "added" || page.Next == nil {
		t.Fatal(page)
	}
	older := read("?limit=1&before=" + *page.Next)
	if len(older.Changes) != 1 || older.Changes[0].Sequence >= page.Changes[0].Sequence || older.Changes[0].Kind != "removed" {
		t.Fatal(older)
	}
	selection = nil
	sync()
	if len(read("").Changes) != 5 {
		t.Fatal("empty selection did not preserve removals")
	}
	if *read("").TrackingSince != *baseline.TrackingSince {
		t.Fatal("baseline moved")
	}
	c.client.Transport = transportFunc(func(*http.Request) (*http.Response, error) { return nil, errors.New("offline") })
	if err := c.syncPlaylist(context.Background()); err == nil {
		t.Fatal("expected network error")
	}
	if len(read("").Changes) != 5 {
		t.Fatal("network error changed history")
	}
	other := testControllerStage(t, "palac-dance")
	response := request(other.routes(), "GET", "/api/radio/palac-dance/changes", "", "")
	if !strings.Contains(response.Body.String(), `"changes":[]`) {
		t.Fatal("history crossed station boundary")
	}
	for _, query := range []string{"?limit=0", "?limit=101", "?limit=x", "?before=0", "?before=-1", "?before=999999999999999999999999", "?before=" + strconv.Quote("1")} {
		if r := request(c.routes(), "GET", "/api/radio/palac-feel/changes"+query, "", ""); r.Code != 400 {
			t.Fatal(query, r.Code)
		}
	}
	c.db.Close()
	if r := request(c.routes(), "GET", "/api/radio/palac-feel/changes", "", ""); r.Code != 503 {
		t.Fatal("failed database presented as empty history")
	}
}

func TestFailedFirstSyncDoesNotSetHistoryBaseline(t *testing.T) {
	c := testController(t)
	one := addTrack(t, c, "1", "One")
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) { return reply(r, 200, plexPage(0, 1, []track{one})), nil })
	if _, err := c.db.Exec("CREATE TRIGGER fail_track BEFORE INSERT ON tracks BEGIN SELECT RAISE(ABORT,'test failure'); END"); err != nil {
		t.Fatal(err)
	}
	if err := c.syncPlaylist(context.Background()); err == nil {
		t.Fatal("expected failure")
	}
	var n int
	if err := c.db.QueryRow("SELECT count(*) FROM state WHERE key='changes_since'").Scan(&n); err != nil || n != 0 {
		t.Fatal("failed baseline persisted", n, err)
	}
}
