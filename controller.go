package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	randv2 "math/rand/v2"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	_ "modernc.org/sqlite"
)

type controller struct {
	liveAudience audienceCache
	cfg          config
	stage        scene
	db           *sql.DB
	mu           sync.Mutex
	syncMu       sync.Mutex
	artMu        sync.Mutex
	client       *http.Client
	pageSize     int
}

type track struct {
	ID, Title, Artist, Path string
	Duration                int64
	Details                 trackDetails
}

func openController(cfg config) (*controller, error) {
	stage, err := sceneFor(cfg.Stage)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(cfg.StateDir, 0700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", filepath.Join(cfg.StateDir, "radio.sqlite"))
	if err != nil {
		return nil, err
	}
	// ponytail: serialized state at pilot scale; use read snapshots if API contention appears.
	db.SetMaxOpenConns(1)
	c := &controller{cfg: cfg, stage: stage, db: db, pageSize: 200, client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	_, err = db.Exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
	CREATE TABLE IF NOT EXISTS tracks(id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL, path TEXT NOT NULL, duration INTEGER NOT NULL);
	CREATE TABLE IF NOT EXISTS retired_tracks(id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL, path TEXT NOT NULL, duration INTEGER NOT NULL, retired_at INTEGER NOT NULL);
	CREATE TABLE IF NOT EXISTS track_details(id TEXT PRIMARY KEY, album_id TEXT NOT NULL, album TEXT NOT NULL, artist_id TEXT NOT NULL, cover_path TEXT NOT NULL, portrait_path TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS catalogue_changes(sequence INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK(kind IN ('added','removed')), id TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, album TEXT NOT NULL, observed_at TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS cycle(id TEXT PRIMARY KEY, rank INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT 0);
	CREATE TABLE IF NOT EXISTS reservations(event TEXT PRIMARY KEY, id TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, path TEXT NOT NULL, duration INTEGER NOT NULL, reserved_at INTEGER NOT NULL);
	CREATE TABLE IF NOT EXISTS playback(event TEXT PRIMARY KEY, id TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, path TEXT NOT NULL, duration INTEGER NOT NULL, started_at INTEGER NOT NULL);
	CREATE INDEX IF NOT EXISTS playback_time ON playback(started_at);
	CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS samples(at INTEGER PRIMARY KEY, listeners INTEGER);
	CREATE TABLE IF NOT EXISTS daily(date TEXT PRIMARY KEY, peak INTEGER NOT NULL, listener_seconds REAL NOT NULL DEFAULT 0, measured_seconds REAL NOT NULL DEFAULT 0);`)
	if err == nil {
		var columns int
		err = db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('cycle') WHERE name='created_at'").Scan(&columns)
		if err == nil && columns == 0 {
			var migration *sql.Tx
			migration, err = db.Begin()
			if err == nil {
				_, err = migration.Exec("ALTER TABLE cycle ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0")
				if err == nil {
					_, err = migration.Exec("UPDATE cycle SET created_at=?", time.Now().UTC().UnixMilli())
				}
				if err == nil {
					err = migration.Commit()
				}
				_ = migration.Rollback()
			}
		}
	}
	if err == nil {
		err = c.restoreFallback()
	}
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return c, nil
}

var idPattern = regexp.MustCompile(`^[0-9]{1,32}$`)
var eventPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
var pathPattern = regexp.MustCompile(`(?:/[\pL\pN_.~ -]+){2,}|(?:^|[\s"'(])/[\pL\pN_.~][^\s"'<>]*|[A-Za-z]:[\\/][^\s]+`)
var backupPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}\.sqlite$`)

func (c *controller) cleanMetadata(s string) string {
	s = pathPattern.ReplaceAllString(s, "")
	for _, secret := range []string{c.cfg.PlexToken, c.cfg.InternalToken, c.cfg.MusicRoot} {
		if secret != "" {
			s = strings.ReplaceAll(s, secret, "")
		}
	}
	s = pathPattern.ReplaceAllString(s, "")
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, s)
	runes := []rune(strings.TrimSpace(s))
	if len(runes) > 256 {
		runes = runes[:256]
	}
	return string(runes)
}

func (c *controller) playable(path string) error {
	if !filepath.IsAbs(path) || strings.ContainsAny(path, "\r\n") || strings.IndexFunc(path, unicode.IsControl) >= 0 {
		return errors.New("invalid music path")
	}
	root, err := filepath.EvalSymlinks(c.cfg.MusicRoot)
	if err != nil {
		return err
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(root, resolved)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return errors.New("music path outside root")
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("music path is not regular")
	}
	switch strings.ToLower(filepath.Ext(resolved)) {
	case ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".aiff", ".aif", ".alac", ".wma":
		return nil
	}
	return errors.New("unsupported audio path")
}

func annotated(t track, event string) (string, error) {
	escape := func(s string) (string, error) {
		if strings.IndexFunc(s, unicode.IsControl) >= 0 {
			return "", errors.New("control character in annotation")
		}
		return strings.NewReplacer("\\", "\\\\", `"`, `\"`).Replace(s), nil
	}
	if !idPattern.MatchString(t.ID) || (event != "" && !eventPattern.MatchString(event)) {
		return "", errors.New("invalid annotation ID")
	}
	title, err := escape(t.Title)
	if err != nil {
		return "", err
	}
	artist, err := escape(t.Artist)
	if err != nil {
		return "", err
	}
	if !filepath.IsAbs(t.Path) || strings.IndexFunc(t.Path, unicode.IsControl) >= 0 {
		return "", errors.New("invalid annotation path")
	}
	annotation := fmt.Sprintf(`annotate:pavoia_id="%s",title="%s",artist="%s"`, t.ID, title, artist)
	if event != "" {
		annotation += `,pavoia_event="` + event + `"`
	}
	return annotation + ":" + t.Path, nil
}

func newEvent() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func readTracks(ctx context.Context, q interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}) ([]track, error) {
	rows, err := q.QueryContext(ctx, "SELECT id,title,artist,path,duration FROM tracks ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ts := []track{}
	for rows.Next() {
		var t track
		if err := rows.Scan(&t.ID, &t.Title, &t.Artist, &t.Path, &t.Duration); err != nil {
			return nil, err
		}
		ts = append(ts, t)
	}
	return ts, rows.Err()
}

func writeAtomic(path string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".fallback-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(f.Name(), path)
	}
	if err == nil {
		var dir *os.File
		dir, err = os.Open(filepath.Dir(path))
		if err == nil {
			err = dir.Sync()
			_ = dir.Close()
		}
	}
	return err
}

func fallback(ts []track) ([]byte, error) {
	var b strings.Builder
	b.WriteString("#EXTM3U\n")
	for _, t := range ts {
		uri, err := annotated(t, "")
		if err != nil {
			return nil, err
		}
		b.WriteString(uri)
		b.WriteByte('\n')
	}
	return []byte(b.String()), nil
}

func (c *controller) restoreFallback() error {
	ts, err := readTracks(context.Background(), c.db)
	if err != nil {
		return err
	}
	data, err := fallback(ts)
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(c.cfg.StateDir, "fallback.m3u"), data)
}

func (c *controller) enabled(ctx context.Context) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var synced int
	if err := c.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM state WHERE key='last_sync'").Scan(&synced); err != nil {
		return false, err
	}
	if synced == 0 {
		return false, nil
	}
	if root, err := os.Stat(c.cfg.MusicRoot); err != nil || !root.IsDir() {
		return false, nil
	}
	rows, err := c.db.QueryContext(ctx, "SELECT path FROM tracks")
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var path string
		if err = rows.Scan(&path); err != nil {
			return false, err
		}
		if c.playable(path) == nil {
			return true, nil
		}
	}
	return false, rows.Err()
}

func (c *controller) next(ctx context.Context, now time.Time) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	// Abandoned queues expire; the window also covers the longest accepted audio plus prefetch.
	if _, err := tx.ExecContext(ctx, "DELETE FROM reservations WHERE reserved_at < ?", now.Add(-48*time.Hour).UnixMilli()); err != nil {
		return "", err
	}
	var count int
	if err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM cycle WHERE NOT EXISTS(SELECT 1 FROM reservations r WHERE r.id=cycle.id)").Scan(&count); err != nil {
		return "", err
	}
	if count == 0 {
		// Reserved-only remnants cannot block the next cycle's available tracks.
		if _, err = tx.ExecContext(ctx, "DELETE FROM cycle"); err != nil {
			return "", err
		}
		ts, err := readTracks(ctx, tx)
		if err != nil {
			return "", err
		}
		randv2.Shuffle(len(ts), func(i, j int) { ts[i], ts[j] = ts[j], ts[i] })
		for i, t := range ts {
			if _, err = tx.ExecContext(ctx, "INSERT INTO cycle(id,rank,created_at) VALUES(?,?,?)", t.ID, i, time.Now().UTC().UnixMilli()); err != nil {
				return "", err
			}
		}
	}
	rows, err := tx.QueryContext(ctx, `SELECT artist FROM (SELECT artist,started_at AS at FROM playback UNION ALL SELECT artist,reserved_at AS at FROM reservations) ORDER BY at DESC LIMIT 3`)
	if err != nil {
		return "", err
	}
	recent := map[string]bool{}
	for rows.Next() {
		var artist string
		if err := rows.Scan(&artist); err != nil {
			_ = rows.Close()
			return "", err
		}
		recent[strings.ToLower(artist)] = true
	}
	err = rows.Err()
	_ = rows.Close()
	if err != nil {
		return "", err
	}
	rows, err = tx.QueryContext(ctx, `SELECT t.id,t.title,t.artist,t.path,t.duration FROM cycle c JOIN tracks t ON c.id=t.id WHERE NOT EXISTS(SELECT 1 FROM reservations r WHERE r.id=t.id) ORDER BY c.rank`)
	if err != nil {
		return "", err
	}
	ts := []track{}
	for rows.Next() {
		var t track
		if err := rows.Scan(&t.ID, &t.Title, &t.Artist, &t.Path, &t.Duration); err != nil {
			_ = rows.Close()
			return "", err
		}
		ts = append(ts, t)
	}
	err = rows.Err()
	_ = rows.Close()
	if err != nil {
		return "", err
	}
	// Prefer a fresh artist while keeping the shuffled order within each group.
	ordered := []track{}
	for _, t := range ts {
		if !recent[strings.ToLower(t.Artist)] {
			ordered = append(ordered, t)
		}
	}
	for _, t := range ts {
		if recent[strings.ToLower(t.Artist)] {
			ordered = append(ordered, t)
		}
	}
	for i, t := range ordered {
		if i == 32 {
			break
		}
		if _, err = tx.ExecContext(ctx, "DELETE FROM cycle WHERE id=?", t.ID); err != nil {
			return "", err
		}
		if c.playable(t.Path) != nil {
			continue
		}
		event, err := newEvent()
		if err != nil {
			return "", err
		}
		uri, err := annotated(t, event)
		if err != nil {
			return "", err
		}
		_, err = tx.ExecContext(ctx, "INSERT INTO reservations(event,id,title,artist,path,duration,reserved_at) VALUES(?,?,?,?,?,?,?)", event, t.ID, t.Title, t.Artist, t.Path, t.Duration, now.UnixMilli())
		if err != nil {
			return "", err
		}
		if err = tx.Commit(); err != nil {
			return "", err
		}
		return uri, nil
	}
	return "", tx.Commit()
}

var errInvalidCallback = errors.New("invalid callback")
var errCallbackConflict = errors.New("callback conflict")

func (c *controller) played(ctx context.Context, id, event string, now time.Time) error {
	if !idPattern.MatchString(id) || !eventPattern.MatchString(event) {
		return errInvalidCallback
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var existing string
	err = tx.QueryRowContext(ctx, "SELECT id FROM playback WHERE event=?", event).Scan(&existing)
	if err == nil {
		if existing != id {
			return errCallbackConflict
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	var t track
	err = tx.QueryRowContext(ctx, "SELECT id,title,artist,path,duration FROM reservations WHERE event=?", event).Scan(&t.ID, &t.Title, &t.Artist, &t.Path, &t.Duration)
	reserved := err == nil
	if err == nil && t.ID != id {
		return errCallbackConflict
	}
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, "SELECT id,title,artist,path,duration FROM tracks WHERE id=?", id).Scan(&t.ID, &t.Title, &t.Artist, &t.Path, &t.Duration)
	}
	if errors.Is(err, sql.ErrNoRows) {
		err = tx.QueryRowContext(ctx, "SELECT id,title,artist,path,duration FROM retired_tracks WHERE id=?", id).Scan(&t.ID, &t.Title, &t.Artist, &t.Path, &t.Duration)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return errCallbackConflict
	}
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO playback(event,id,title,artist,path,duration,started_at) VALUES(?,?,?,?,?,?,?)", event, t.ID, t.Title, t.Artist, t.Path, t.Duration, now.UnixMilli())
	if err != nil {
		return err
	}
	// next already consumed a reserved slot. A delayed fallback start must not consume
	// a slot created later by a refill or playlist import.
	if !reserved {
		if _, err = tx.ExecContext(ctx, "DELETE FROM cycle WHERE id=? AND created_at<=?", id, now.UnixMilli()); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM reservations WHERE event=?", event); err != nil {
		return err
	}
	return tx.Commit()
}

func (c *controller) maintain(ctx context.Context, now time.Time) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, err := c.db.ExecContext(ctx, "DELETE FROM samples WHERE at < ?", now.AddDate(0, 0, -30).UnixMilli()); err != nil {
		return err
	}
	dir := filepath.Join(c.cfg.StateDir, "backups")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	path := filepath.Join(dir, now.UTC().Format("2006-01-02")+".sqlite")
	if _, err := os.Stat(path); errors.Is(err, fs.ErrNotExist) {
		temp := path + ".tmp"
		_ = os.Remove(temp)
		if _, err = c.db.ExecContext(ctx, "VACUUM INTO '"+strings.ReplaceAll(temp, "'", "''")+"'"); err != nil {
			_ = os.Remove(temp)
			return err
		}
		if err = os.Chmod(temp, 0600); err != nil {
			return err
		}
		f, err := os.Open(temp)
		if err != nil {
			return err
		}
		err = f.Sync()
		_ = f.Close()
		if err != nil {
			return err
		}
		if err = os.Rename(temp, path); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	files := []string{}
	for _, entry := range entries {
		if !entry.IsDir() && backupPattern.MatchString(entry.Name()) {
			files = append(files, entry.Name())
		}
	}
	for len(files) > 7 {
		if err := os.Remove(filepath.Join(dir, files[0])); err != nil {
			return err
		}
		files = files[1:]
	}
	return nil
}
