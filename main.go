package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type config struct {
	Listen, StateDir, MusicRoot, PlexURL, PlexToken, InternalToken, IcecastURL, Stage string
}

type scene struct {
	ID, Name    string
	PlaylistIDs []string
}

func sceneFor(id string) (scene, error) {
	switch id {
	case "", "palac-feel":
		return scene{"palac-feel", "Palac Feel", []string{"146686"}}, nil
	case "palac-dance":
		return scene{"palac-dance", "Palac Dance", []string{"145470"}}, nil
	case "bermuda-day":
		return scene{"bermuda-day", "Under the Sun", []string{"146377"}}, nil
	case "bermuda-evening":
		return scene{"bermuda-evening", "As Night Begins", []string{"145468"}}, nil
	case "essentials":
		return scene{"essentials", "Essentials", []string{"147167"}}, nil
	case "etage-zero":
		return scene{"etage-zero", "Etage 0", []string{"145471", "147259"}}, nil
	case "fontanna":
		return scene{"fontanna", "Fontanna", []string{"145469", "162633"}}, nil
	case "ambiance":
		return scene{"ambiance", "Ambiance", []string{"145472"}}, nil
	case "closing":
		return scene{"closing", "Closing", []string{"162463"}}, nil
	default:
		return scene{}, errors.New("unknown PAVOIA_STAGE")
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func loadConfig() (config, error) {
	c := config{
		Listen: env("PAVOIA_LISTEN", "127.0.0.1:14502"), StateDir: env("PAVOIA_STATE_DIR", "/state"),
		MusicRoot: os.Getenv("PAVOIA_MUSIC_ROOT"), PlexURL: env("PAVOIA_PLEX_URL", "http://127.0.0.1:31711"),
		PlexToken: os.Getenv("PAVOIA_PLEX_TOKEN"), InternalToken: os.Getenv("PAVOIA_INTERNAL_TOKEN"),
		IcecastURL: env("PAVOIA_ICECAST_URL", "http://127.0.0.1:14501"), Stage: os.Getenv("PAVOIA_STAGE"),
	}
	stage, err := sceneFor(c.Stage)
	if err != nil {
		return c, err
	}
	c.Stage = stage.ID
	if !filepath.IsAbs(c.MusicRoot) || !filepath.IsAbs(c.StateDir) || strings.TrimSpace(c.InternalToken) == "" || strings.TrimSpace(c.PlexToken) == "" {
		return c, errors.New("absolute state/music directories and both tokens are required")
	}
	host, port, err := net.SplitHostPort(c.Listen)
	ip := net.ParseIP(host)
	portNumber, portErr := strconv.Atoi(port)
	if err != nil || ip == nil || !ip.IsLoopback() || portErr != nil || portNumber < 1 || portNumber > 65535 {
		return c, errors.New("HTTP listener must bind an explicit loopback address")
	}
	for _, address := range []string{c.PlexURL, c.IcecastURL} {
		u, err := url.Parse(address)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return c, errors.New("invalid upstream URL")
		}
	}
	return c, nil
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}
	c, err := openController(cfg)
	if err != nil {
		log.Fatal("controller state unavailable")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	var workers sync.WaitGroup
	workers.Add(1)
	go func() { defer workers.Done(); c.run(ctx) }()
	server := &http.Server{Addr: cfg.Listen, Handler: c.routes(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 100 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	errCh := make(chan error, 1)
	go func() { errCh <- server.ListenAndServe() }()
	failed := false
	select {
	case <-ctx.Done():
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Print("HTTP listener stopped")
			failed = true
		}
		cancel()
	}
	shutdown, stop := context.WithTimeout(context.Background(), 10*time.Second)
	defer stop()
	if err := server.Shutdown(shutdown); err != nil {
		_ = server.Close()
	}
	cancel()
	workers.Wait()
	_ = c.db.Close()
	if failed {
		os.Exit(1)
	}
}

func (c *controller) run(ctx context.Context) {
	syncTick := time.NewTicker(5 * time.Minute)
	pollTick := time.NewTicker(10 * time.Second)
	maintenance := time.NewTicker(time.Hour)
	defer syncTick.Stop()
	defer pollTick.Stop()
	defer maintenance.Stop()
	var work sync.WaitGroup
	startSync := func() {
		work.Add(1)
		go func() {
			defer work.Done()
			if err := c.syncPlaylist(ctx); err != nil && ctx.Err() == nil {
				log.Print("Plex sync unavailable; cached state retained")
			}
		}()
	}
	startSync()
	if err := c.pollAudience(ctx, time.Now().UTC()); err != nil && ctx.Err() == nil {
		log.Print("audience collection unavailable")
	}
	if err := c.maintain(ctx, time.Now().UTC()); err != nil && ctx.Err() == nil {
		log.Print("state maintenance failed")
	}
	defer work.Wait()
	for {
		select {
		case <-ctx.Done():
			return
		case <-syncTick.C:
			startSync()
		case <-pollTick.C:
			if err := c.pollAudience(ctx, time.Now().UTC()); err != nil && ctx.Err() == nil {
				log.Print("audience collection unavailable")
			}
		case <-maintenance.C:
			if err := c.maintain(ctx, time.Now().UTC()); err != nil && ctx.Err() == nil {
				log.Print("state maintenance failed")
			}
		}
	}
}
