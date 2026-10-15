package main

import (
	"context"
	"net/http"
	"strings"
	"syscall"
	"testing"
)

func TestFailedCommitDoesNotPublishFallback(t *testing.T) {
	c := testController(t)
	tr := addTrack(t, c, "1", "Artist")
	c.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		return reply(r, 200, plexPage(0, 1, []track{tr})), nil
	})
	if err := c.syncPlaylist(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, err := c.db.Exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE commit_parent(id INTEGER PRIMARY KEY);
 CREATE TABLE commit_guard(id INTEGER REFERENCES commit_parent(id) DEFERRABLE INITIALLY DEFERRED);
 CREATE TRIGGER reject_sync AFTER INSERT ON tracks BEGIN INSERT INTO commit_guard VALUES(1); END;`)
	if err != nil {
		t.Fatal(err)
	}
	fd, err := syscall.InotifyInit1(syscall.IN_NONBLOCK | syscall.IN_CLOEXEC)
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.Close(fd)
	if _, err = syscall.InotifyAddWatch(fd, c.cfg.StateDir, syscall.IN_MOVED_TO); err != nil {
		t.Fatal(err)
	}
	tr.Title = "Uncommitted title"
	err = c.syncPlaylist(context.Background())
	if err == nil || !strings.Contains(err.Error(), "FOREIGN KEY") {
		t.Fatalf("expected deferred commit failure, got %v", err)
	}
	// Liquidsoap observes renames, including a publication followed by restoration.
	if n, err := syscall.Read(fd, make([]byte, 4096)); n > 0 || err != syscall.EAGAIN {
		t.Fatalf("failed commit published a fallback file: bytes=%d error=%v", n, err)
	}
}
