package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
)

type trackDetails struct {
	AlbumID, Album, ArtistID, CoverPath, PortraitPath string
}

func validID(s string) string {
	if idPattern.MatchString(s) {
		return s
	}
	return ""
}

func (c *controller) enrichTrack(t *publicTrack, d trackDetails) {
	t.Album, t.AlbumID, t.ArtistID = c.cleanMetadata(d.Album), validID(d.AlbumID), validID(d.ArtistID)
	t.CoverURL = c.artworkURL(t.ID, "cover", d.CoverPath)
	t.ArtistImageURL = c.artworkURL(t.ID, "portrait", d.PortraitPath)
}

// Catalogue reads use committed playlist metadata, without contacting Plex.
func (c *controller) catalogue(w http.ResponseWriter, r *http.Request) {
	c.serveCatalogue(w, r, c.db, nil)
}

type libraryInfo struct {
	Total     int    `json:"total"`
	UpdatedAt string `json:"updatedAt"`
}

type musicCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	ID    string `json:"id,omitempty"`
	Image string `json:"image,omitempty"`
}

// A name links only to a discovery artist or label and to a discovery picture.
func (c *controller) cleanCount(m *musicCount) {
	m.Name = c.cleanMetadata(m.Name)
	if !discoveryID.MatchString(m.ID) || !(strings.HasPrefix(m.ID, "art_") || strings.HasPrefix(m.ID, "lab_")) {
		m.ID = ""
	}
	if sha, ok := strings.CutPrefix(m.Image, "/api/discovery/media/"); !ok || !discoverySHA.MatchString(sha) {
		m.Image = ""
	}
}

type libraryMusicStats struct {
	Scope      string         `json:"scope"`
	UpdatedAt  string         `json:"updatedAt"`
	MetadataAt *string        `json:"metadataAt"`
	Tracks     int            `json:"tracks"`
	Artists    int            `json:"artists"`
	Releases   int            `json:"releases"`
	DurationMS int64          `json:"durationMs"`
	Coverage   map[string]int `json:"coverage"`
	TopArtists []musicCount   `json:"topArtists"`
	Years      []musicCount   `json:"years"`
	Labels     []musicCount   `json:"labels"`
	Genres     []musicCount   `json:"genres"`
	Stages     []musicCount   `json:"stages"`
}

func (c *controller) libraryStatistics(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	if scope == "" {
		scope = "radio"
	}
	if scope != "radio" && scope != "library" {
		if _, err := sceneFor(scope); err != nil {
			http.Error(w, "invalid statistics scope", 400)
			return
		}
	}
	db, err := c.openLibrary()
	if err != nil {
		http.Error(w, "statistics unavailable", 503)
		return
	}
	defer db.Close()
	var doc string
	var result libraryMusicStats
	if err = db.QueryRowContext(r.Context(), "SELECT doc FROM music_statistics WHERE scope=?", scope).Scan(&doc); err != nil || json.Unmarshal([]byte(doc), &result) != nil {
		http.Error(w, "statistics unavailable", 503)
		return
	}
	for _, counts := range [][]musicCount{result.TopArtists, result.Years, result.Labels, result.Genres, result.Stages} {
		for i := range counts {
			c.cleanCount(&counts[i])
		}
	}
	jsonResponse(w, 200, result)
}

type nameEntry struct {
	musicCount
	Stages map[string]int `json:"stages"`
}

type musicNames struct {
	Kind      string      `json:"kind"`
	UpdatedAt string      `json:"updatedAt"`
	Total     int         `json:"total"`
	Items     []nameEntry `json:"items"`
}

// Every artist or label of the radio playlists, with its track count per stage.
func (c *controller) libraryNames(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	if kind != "artists" && kind != "labels" {
		http.Error(w, "invalid names kind", 400)
		return
	}
	db, err := c.openLibrary()
	if err != nil {
		http.Error(w, "names unavailable", 503)
		return
	}
	defer db.Close()
	var doc string
	var result musicNames
	if err = db.QueryRowContext(r.Context(), "SELECT doc FROM music_names WHERE kind=?", kind).Scan(&doc); err != nil || json.Unmarshal([]byte(doc), &result) != nil {
		http.Error(w, "names unavailable", 503)
		return
	}
	for i := range result.Items {
		c.cleanCount(&result.Items[i].musicCount)
		for stage := range result.Items[i].Stages {
			if s, err := sceneFor(stage); err != nil || s.ID != stage {
				delete(result.Items[i].Stages, stage)
			}
		}
	}
	// Every artist of the playlists is about 680 KB of JSON and 175 KB gzipped.
	gzipJSON(w, r, result)
}

// Open each immutable snapshot on demand so atomic replacements appear without a restart.
func (c *controller) openLibrary() (*sql.DB, error) {
	u := url.URL{Scheme: "file", Path: filepath.Join(c.cfg.StateDir, "library.sqlite"), RawQuery: "mode=ro&immutable=1"}
	db, err := sql.Open("sqlite", u.String())
	if err == nil {
		db.SetMaxOpenConns(1)
	}
	return db, err
}

func (c *controller) libraryCatalogue(w http.ResponseWriter, r *http.Request) {
	db, err := c.openLibrary()
	if err != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	defer db.Close()
	var info libraryInfo
	if err = db.QueryRowContext(r.Context(), "SELECT total,updated_at FROM library_info").Scan(&info.Total, &info.UpdatedAt); err != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	c.serveCatalogue(w, r, db, &info)
}

func (c *controller) serveCatalogue(w http.ResponseWriter, r *http.Request, db *sql.DB, library *libraryInfo) {
	limit := 50
	var err error
	if s := r.URL.Query().Get("limit"); s != "" {
		limit, err = strconv.Atoi(s)
	}
	after, search := r.URL.Query().Get("after"), strings.TrimSpace(r.URL.Query().Get("q"))
	if err != nil || limit < 1 || limit > 100 || (after != "" && validID(after) == "") || len(search) > 200 {
		http.Error(w, "invalid catalogue query", 400)
		return
	}
	pattern := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(search) + "%"
	rows, err := db.QueryContext(r.Context(), `SELECT t.id,t.title,t.artist,t.duration,
      COALESCE(d.album_id,''),COALESCE(d.album,''),COALESCE(d.artist_id,''),COALESCE(d.cover_path,''),COALESCE(d.portrait_path,'')
      FROM tracks t LEFT JOIN track_details d ON d.id=t.id WHERE t.id > ?
      AND (t.title LIKE ? ESCAPE '\' OR t.artist LIKE ? ESCAPE '\' OR d.album LIKE ? ESCAPE '\')
      ORDER BY t.id LIMIT ?`, after, pattern, pattern, pattern, limit+1)
	if err != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	defer rows.Close()
	result := struct {
		Tracks  []publicTrack `json:"tracks"`
		Next    *string       `json:"next"`
		Library *libraryInfo  `json:"library,omitempty"`
	}{Tracks: []publicTrack{}, Library: library}
	for rows.Next() {
		var t publicTrack
		var d trackDetails
		if err = rows.Scan(&t.ID, &t.Title, &t.Artist, &t.DurationMS, &d.AlbumID, &d.Album, &d.ArtistID, &d.CoverPath, &d.PortraitPath); err != nil {
			break
		}
		t.Title, t.Artist = c.cleanMetadata(t.Title), c.cleanMetadata(t.Artist)
		c.enrichTrack(&t, d)
		if library != nil {
			t.CoverURL = strings.Replace(t.CoverURL, "/api/radio/"+c.stage.ID+"/", "/api/library/", 1)
			t.ArtistImageURL = strings.Replace(t.ArtistImageURL, "/api/radio/"+c.stage.ID+"/", "/api/library/", 1)
		}
		result.Tracks = append(result.Tracks, t)
	}
	if err != nil || rows.Err() != nil {
		http.Error(w, "catalogue unavailable", 503)
		return
	}
	if len(result.Tracks) > limit {
		result.Tracks = result.Tracks[:limit]
		last := result.Tracks[limit-1].ID
		result.Next = &last
	}
	jsonResponse(w, 200, result)
}

func artworkSource(db *sql.DB, r *http.Request) (string, error) {
	if validID(r.PathValue("id")) == "" {
		return "", sql.ErrNoRows
	}
	var d trackDetails
	err := db.QueryRowContext(r.Context(), `SELECT d.cover_path,d.portrait_path FROM track_details d JOIN tracks t ON t.id=d.id WHERE d.id=?`, r.PathValue("id")).Scan(&d.CoverPath, &d.PortraitPath)
	if err != nil {
		return "", err
	}
	var path string
	switch r.PathValue("kind") {
	case "cover":
		path = d.CoverPath
	case "portrait":
		path = d.PortraitPath
	default:
		return "", sql.ErrNoRows
	}
	if validArtworkPath(path) == "" {
		return "", sql.ErrNoRows
	}
	return path, nil
}

var errArtworkUnavailable = errors.New("artwork unavailable")
