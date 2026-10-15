package main

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	randv2 "math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type plexContainer struct {
	XMLName xml.Name `xml:"MediaContainer"`
	Size    *int     `xml:"size,attr"`
	Total   *int     `xml:"totalSize,attr"`
	Offset  *int     `xml:"offset,attr"`
	Tracks  []struct {
		ID             string `xml:"ratingKey,attr"`
		Title          string `xml:"title,attr"`
		Artist         string `xml:"grandparentTitle,attr"`
		OriginalArtist string `xml:"originalTitle,attr"`
		Duration       int64  `xml:"duration,attr"`
		AlbumID        string `xml:"parentRatingKey,attr"`
		Album          string `xml:"parentTitle,attr"`
		ArtistID       string `xml:"grandparentRatingKey,attr"`
		Cover          string `xml:"thumb,attr"`
		AlbumCover     string `xml:"parentThumb,attr"`
		Portrait       string `xml:"grandparentThumb,attr"`
		Media          []struct {
			Parts []struct {
				File string `xml:"file,attr"`
			} `xml:"Part"`
		} `xml:"Media"`
	} `xml:"Track"`
}

func (c *controller) logicalPath(path string) (string, error) {
	// Plex may advertise the physical alias while the containers mount the logical root.
	const logical = "/home/yolan/files/plex_music_library/opus"
	const physical = "/mnt/mpathj/yolan/files/plex_music_library/opus"
	if filepath.Clean(c.cfg.MusicRoot) == logical && strings.HasPrefix(path, physical+"/") {
		path = logical + strings.TrimPrefix(path, physical)
	}
	if err := c.playable(path); err != nil {
		return "", err
	}
	root, err := filepath.EvalSymlinks(c.cfg.MusicRoot)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, resolved)
	if err != nil {
		return "", err
	}
	return filepath.Join(c.cfg.MusicRoot, rel), nil
}

func (c *controller) fetchPlaylist(ctx context.Context) ([]track, error) {
	result := []track{}
	seen := map[string]bool{}
	for _, id := range c.stage.PlaylistIDs {
		tracks, err := c.fetchPlaylistSource(ctx, id)
		if err != nil {
			return nil, err
		}
		for _, t := range tracks {
			if !seen[t.ID] {
				result = append(result, t)
				seen[t.ID] = true
			}
		}
	}
	return result, nil
}

func (c *controller) fetchPlaylistSource(ctx context.Context, playlistID string) ([]track, error) {
	root, err := os.Stat(c.cfg.MusicRoot)
	if err != nil || !root.IsDir() {
		return nil, errors.New("music root unavailable")
	}
	result := []track{}
	seen := map[string]bool{}
	total := -1
	for start := 0; total < 0 || start < total; {
		u, err := url.Parse(strings.TrimRight(c.cfg.PlexURL, "/") + "/playlists/" + playlistID + "/items")
		if err != nil {
			return nil, err
		}
		q := u.Query()
		q.Set("X-Plex-Container-Start", strconv.Itoa(start))
		q.Set("X-Plex-Container-Size", strconv.Itoa(c.pageSize))
		u.RawQuery = q.Encode()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("X-Plex-Token", c.cfg.PlexToken)
		req.Header.Set("Accept", "application/xml")
		res, err := c.client.Do(req)
		if err != nil {
			return nil, err
		}
		body, err := io.ReadAll(io.LimitReader(res.Body, (8<<20)+1))
		_ = res.Body.Close()
		if err != nil {
			return nil, err
		}
		if res.StatusCode != 200 || len(body) > 8<<20 {
			return nil, errors.New("invalid Plex response")
		}
		var page plexContainer
		if err = xml.Unmarshal(body, &page); err != nil {
			return nil, err
		}
		if page.Size == nil || page.Total == nil || *page.Total < 0 || *page.Total > 100000 || *page.Size != len(page.Tracks) || *page.Size > c.pageSize || (page.Offset != nil && *page.Offset != start) {
			return nil, errors.New("unverified Plex pagination")
		}
		if total < 0 {
			total = *page.Total
		} else if total != *page.Total {
			return nil, errors.New("Plex playlist changed during pagination")
		}
		if start+len(page.Tracks) > total || (len(page.Tracks) == 0 && start < total) {
			return nil, errors.New("incomplete Plex page")
		}
		for _, item := range page.Tracks {
			if !idPattern.MatchString(item.ID) || seen[item.ID] {
				return nil, errors.New("invalid or repeated Plex track")
			}
			seen[item.ID] = true
			if item.Duration < 0 || item.Duration > 24*60*60*1000 {
				return nil, errors.New("invalid track duration")
			}
			path := ""
			for _, media := range item.Media {
				for _, part := range media.Parts {
					if candidate, e := c.logicalPath(part.File); e == nil {
						path = candidate
						break
					}
				}
				if path != "" {
					break
				}
			}
			if path == "" {
				continue
			}
			artist := item.Artist
			if item.OriginalArtist != "" {
				artist = item.OriginalArtist
			}
			details := trackDetails{AlbumID: validID(item.AlbumID), Album: c.cleanMetadata(item.Album), CoverPath: validArtworkPath(item.Cover)}
			if details.CoverPath == "" {
				details.CoverPath = validArtworkPath(item.AlbumCover)
			}
			if strings.EqualFold(artist, item.Artist) && artist != "" && !strings.EqualFold(artist, "Various Artists") && !strings.EqualFold(artist, "Various") {
				details.ArtistID = validID(item.ArtistID)
				details.PortraitPath = validArtworkPath(item.Portrait)
			}
			result = append(result, track{ID: item.ID, Title: c.cleanMetadata(item.Title), Artist: c.cleanMetadata(artist), Path: path, Duration: item.Duration, Details: details})
		}
		start += len(page.Tracks)
		if total == 0 {
			break
		}
	}
	if total > 0 && len(result) == 0 {
		return nil, errors.New("playlist has no accessible audio")
	}
	return result, nil
}

var errSyncBusy = errors.New("sync already running")

func (c *controller) syncPlaylist(parent context.Context) error {
	if !c.syncMu.TryLock() {
		return errSyncBusy
	}
	defer c.syncMu.Unlock()
	ctx, cancel := context.WithTimeout(parent, 90*time.Second)
	defer cancel()
	ts, err := c.fetchPlaylist(ctx)
	if err != nil {
		return err
	}
	randv2.Shuffle(len(ts), func(i, j int) { ts[i], ts[j] = ts[j], ts[i] })
	data, err := fallback(ts)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	oldRows, err := readTracks(ctx, tx)
	if err != nil {
		return err
	}
	oldIDs := map[string]bool{}
	for _, t := range oldRows {
		oldIDs[t.ID] = true
	}
	if err = recordCatalogueChanges(ctx, tx, ts, oldIDs); err != nil {
		return err
	}
	// Retain removed metadata for queued audio and delayed actual-start callbacks.
	if _, err = tx.ExecContext(ctx, "INSERT OR REPLACE INTO retired_tracks SELECT id,title,artist,path,duration,? FROM tracks", time.Now().UTC().UnixMilli()); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM tracks"); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM track_details"); err != nil {
		return err
	}
	var rank int64
	if err = tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(rank),-1)+1 FROM cycle").Scan(&rank); err != nil {
		return err
	}
	for _, t := range ts {
		if _, err = tx.ExecContext(ctx, "INSERT INTO tracks(id,title,artist,path,duration) VALUES(?,?,?,?,?)", t.ID, t.Title, t.Artist, t.Path, t.Duration); err != nil {
			return err
		}
		d := t.Details
		if _, err = tx.ExecContext(ctx, "INSERT INTO track_details(id,album_id,album,artist_id,cover_path,portrait_path) VALUES(?,?,?,?,?,?)", t.ID, d.AlbumID, d.Album, d.ArtistID, d.CoverPath, d.PortraitPath); err != nil {
			return err
		}
		if !oldIDs[t.ID] {
			if _, err = tx.ExecContext(ctx, "INSERT OR IGNORE INTO cycle(id,rank,created_at) VALUES(?,?,?)", t.ID, rank, time.Now().UTC().UnixMilli()); err != nil {
				return err
			}
			rank++
		}
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM cycle WHERE id NOT IN (SELECT id FROM tracks)"); err != nil {
		return err
	}
	// Up to 48 hours of queued audio, followed by the 48-hour callback retry window.
	if _, err = tx.ExecContext(ctx, "DELETE FROM retired_tracks WHERE id IN (SELECT id FROM tracks) OR retired_at<?", time.Now().Add(-96*time.Hour).UnixMilli()); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO state(key,value) VALUES('last_sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", time.Now().UTC().Format(time.RFC3339)); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit sync: %w", err)
	}
	// Export committed tracks. Startup and the next sync repair an interrupted export.
	return writeAtomic(filepath.Join(c.cfg.StateDir, "fallback.m3u"), data)
}
