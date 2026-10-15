package main

import (
	"context"
	"net/http"
	"sync"
	"time"
)

type audienceCache struct {
	sync.Mutex
	measured time.Time
	body     []byte
	err      error
}

func (c *controller) liveAudienceStatus(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("stage")
	stage, err := sceneFor(id)
	if err != nil || id == "" {
		http.Error(w, "unknown stage", http.StatusBadRequest)
		return
	}
	// Share one short Icecast sample across listeners without increasing database writes.
	cache := &c.liveAudience
	cache.Lock()
	if time.Since(cache.measured) >= time.Second {
		// A listener leaving must not cancel the sample shared by other listeners.
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Second)
		cache.body, cache.err = c.readIcecast(ctx)
		cancel()
		cache.measured = time.Now().UTC()
	}
	body, measured, fetchErr := cache.body, cache.measured, cache.err
	cache.Unlock()
	if fetchErr != nil {
		jsonResponse(w, http.StatusServiceUnavailable, audienceStatus{})
		return
	}
	count, err := icecastListeners(body, "/"+stage.ID+".mp3")
	if err != nil {
		jsonResponse(w, http.StatusServiceUnavailable, audienceStatus{})
		return
	}
	stamp := measured.Format(time.RFC3339Nano)
	jsonResponse(w, http.StatusOK, audienceStatus{Listeners: count, MeasuredAt: &stamp, Available: count != nil})
}
