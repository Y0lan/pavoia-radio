package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLiveAudienceSharesFreshSamplesAndRejectsBadData(t *testing.T) {
	c := testController(t)
	var hits atomic.Int32
	var bad atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if bad.Load() {
			http.Error(w, "unavailable", 503)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"icestats":{"source":[{"listenurl":"http://icecast/palac-feel.mp3","listeners":2},{"listenurl":"http://icecast/essentials.mp3","listeners":0}]}}`))
	}))
	defer server.Close()
	c.cfg.IcecastURL = server.URL
	handler := c.routes()
	read := func(stage string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", "/api/audience?stage="+stage, nil))
		return w
	}
	var work sync.WaitGroup
	for range 12 {
		work.Add(1)
		go func() {
			defer work.Done()
			w := read("palac-feel")
			if w.Code != 200 {
				t.Errorf("status %d", w.Code)
			}
		}()
	}
	work.Wait()
	if hits.Load() != 1 {
		t.Fatalf("shared cache made %d upstream requests", hits.Load())
	}
	for stage, want := range map[string]int{"palac-feel": 2, "essentials": 0} {
		w := read(stage)
		var got audienceStatus
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		if !got.Available || got.Listeners == nil || *got.Listeners != want || got.MeasuredAt == nil {
			t.Fatalf("%s: %+v", stage, got)
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("response may be cached downstream")
		}
	}
	var missing audienceStatus
	_ = json.Unmarshal(read("closing").Body.Bytes(), &missing)
	if missing.Available || missing.Listeners != nil {
		t.Fatal("missing mount became zero")
	}
	if read("unknown").Code != 400 || read("").Code != 400 {
		t.Fatal("unknown stage accepted")
	}
	if hits.Load() != 1 {
		t.Fatal("stage changes bypassed shared cache")
	}
	c.liveAudience.measured = time.Now().Add(-2 * time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	canceled := httptest.NewRequest("GET", "/api/audience?stage=palac-feel", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, canceled)
	if w.Code != 200 || read("essentials").Code != 200 || hits.Load() != 2 {
		t.Fatal("a departing listener canceled the shared sample")
	}
	bad.Store(true)
	c.liveAudience.measured = time.Now().Add(-2 * time.Second)
	failed := read("palac-feel")
	if failed.Code != 503 {
		t.Fatal("stale success reused after failure")
	}
	_ = read("essentials")
	if hits.Load() != 3 {
		t.Fatal("failure was not cached")
	}
}
