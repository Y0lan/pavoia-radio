package main

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
)

// Library details keep history links useful before a rich profile is available.
func (c *controller) discoveryLibraryTrack(w http.ResponseWriter, r *http.Request, id string) {
	db, err := c.openLibrary()
	if err != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	defer db.Close()
	var t publicTrack
	var d trackDetails
	err = db.QueryRowContext(r.Context(), `SELECT t.id,t.title,t.artist,t.duration,
	  COALESCE(d.album_id,''),COALESCE(d.album,''),COALESCE(d.artist_id,''),COALESCE(d.cover_path,''),COALESCE(d.portrait_path,'')
	  FROM tracks t LEFT JOIN track_details d ON d.id=t.id WHERE t.id=?`, id).
		Scan(&t.ID, &t.Title, &t.Artist, &t.DurationMS, &d.AlbumID, &d.Album, &d.ArtistID, &d.CoverPath, &d.PortraitPath)
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	c.enrichTrack(&t, d)
	jsonResponse(w, 200, map[string]any{
		"entity": map[string]any{
			"id": "plex_" + t.ID, "plexId": t.ID, "type": "track", "basicDetails": true,
			"title": c.cleanMetadata(t.Title), "artist": c.cleanMetadata(t.Artist), "album": t.Album,
			"durationMs":  t.DurationMS,
			"image":       strings.Replace(t.CoverURL, "/api/radio/"+c.stage.ID+"/", "/api/library/", 1),
			"connections": []any{},
		},
		"included": []any{},
	})
}
