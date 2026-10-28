// NeonCity launcher (BLD-06, ADR-0034). Serves the game folder next to it on 127.0.0.1 and opens it in an app window, so the game starts
// from one double-click without the limits of file:// pages (they cannot read sibling files such as the world packs). It answers only this
// machine, and it exits when the window closes. Standard library only, so it builds anywhere with `go build` and has nothing to fetch.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

const (
	basePort  = 47820 // saves live in the page's localStorage, which belongs to one origin (port included): keep the port stable
	portTries = 10
	appID     = "neoncity"
)

func main() {
	dirFlag := flag.String("dir", "", "game folder (default: game/ next to the executable)")
	portFlag := flag.Int("port", -1, "port to serve on; 0 picks a free one (default: the remembered port, else 47820-47829)")
	noBrowser := flag.Bool("no-browser", false, "serve only, do not open a window")
	idle := flag.Int("idle", 180, "exit after this many seconds without a ping from the page")
	flag.Parse()

	data := dataDir()
	_ = os.MkdirAll(data, 0o755)
	setupLog(filepath.Join(data, "launcher.log"))

	root, err := gameDir(*dirFlag)
	if err != nil {
		fail(err.Error())
	}
	ln, port, err := listen(*portFlag, root, data)
	if err != nil {
		fail(err.Error())
	}
	if ln == nil { // our launcher already serves this folder: just show another window
		url := fmt.Sprintf("http://127.0.0.1:%d/", port)
		log.Printf("already running at %s", url)
		if !*noBrowser {
			openWindow(url, data)
		}
		return
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	log.Printf("serving %s at %s", root, url)
	fmt.Println("NEONCITY_URL " + url)

	s := newServer(root, port, time.Duration(*idle)*time.Second)
	go s.watch()
	if !*noBrowser {
		go func() {
			if openWindow(url, data) { // the app window is its own browser process: when it ends, so do we
				log.Printf("window closed")
				os.Exit(0)
			}
		}()
	}
	if err := http.Serve(ln, s); err != nil {
		fail("서버 오류: " + err.Error())
	}
}

// gameDir finds the folder to serve and checks it holds the game.
func gameDir(flagDir string) (string, error) {
	dir := flagDir
	if dir == "" {
		exe, err := os.Executable()
		if err != nil {
			return "", err
		}
		if r, err := filepath.EvalSymlinks(exe); err == nil {
			exe = r
		}
		dir = filepath.Join(filepath.Dir(exe), "game")
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(filepath.Join(abs, "index.html")); err != nil {
		return "", fmt.Errorf("게임 폴더(game\\index.html)를 찾지 못했습니다.\n\nzip 파일의 압축을 모두 푼 뒤, 풀린 NeonCity 폴더 안의 NeonCity.exe를 실행해 주세요.\n\n찾은 위치: %s", abs)
	}
	return abs, nil
}

// listen opens the serving port. It returns a nil listener when our own launcher for the same folder already has the port.
func listen(flagPort int, root, data string) (net.Listener, int, error) {
	if flagPort >= 0 {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", flagPort))
		if err != nil {
			return nil, 0, err
		}
		return ln, ln.Addr().(*net.TCPAddr).Port, nil
	}
	memo := filepath.Join(data, "port.txt")
	ports := []int{}
	if b, err := os.ReadFile(memo); err == nil {
		if p, err := strconv.Atoi(strings.TrimSpace(string(b))); err == nil && p > 0 {
			ports = append(ports, p)
		}
	}
	for p := basePort; p < basePort+portTries; p++ {
		if len(ports) == 0 || ports[0] != p {
			ports = append(ports, p)
		}
	}
	for _, p := range ports {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			_ = os.WriteFile(memo, []byte(strconv.Itoa(p)), 0o644)
			return ln, p, nil
		}
		switch who(p) {
		case root:
			return nil, p, nil
		case "":
			continue // somebody else's program: try the next port
		default:
			return nil, 0, errors.New("다른 폴더의 NeonCity가 이미 실행 중입니다.\n그 게임 창을 닫은 뒤 다시 실행해 주세요.")
		}
	}
	return nil, 0, fmt.Errorf("쓸 수 있는 포트가 없습니다 (%d~%d).", basePort, basePort+portTries-1)
}

// who asks the program on a port whether it is a NeonCity launcher, and for which folder ("" when it is not one).
func who(port int) string {
	c := http.Client{Timeout: time.Second}
	r, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/__neoncity/id", port))
	if err != nil {
		return ""
	}
	defer r.Body.Close()
	var id struct{ App, Dir string }
	if json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&id) != nil || id.App != appID {
		return ""
	}
	return id.Dir
}

type server struct {
	root     string
	hosts    map[string]bool
	idle     time.Duration
	start    time.Time
	lastPing atomic.Int64 // unix ms of the page's last ping; 0 before the first
	byeAt    atomic.Int64 // unix ms of the last "page closed" beacon
}

func newServer(root string, port int, idle time.Duration) *server {
	p := strconv.Itoa(port)
	return &server{root: root, idle: idle, start: time.Now(), hosts: map[string]bool{"127.0.0.1:" + p: true, "localhost:" + p: true}}
}

// watch ends the program once the page is gone: no ping for the idle time, or a close beacon not followed by a ping (a reload pings again).
func (s *server) watch() {
	for range time.Tick(time.Second) {
		now := time.Now().UnixMilli()
		last, bye := s.lastPing.Load(), s.byeAt.Load()
		switch {
		case bye > last && now-bye > 10_000:
			log.Printf("page closed")
		case last > 0 && now-last > s.idle.Milliseconds():
			log.Printf("no ping for %s", s.idle)
		case last == 0 && time.Since(s.start) > s.idle+2*time.Minute:
			log.Printf("the page never connected")
		default:
			continue
		}
		os.Exit(0)
	}
}

// MIME types are fixed here: on Windows the registry can map .js to text/plain, which a browser refuses to run under nosniff
var mimes = map[string]string{
	".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css; charset=utf-8",
	".woff2": "font/woff2", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png", ".wasm": "application/wasm",
	".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// only pages of this origin may talk to us: another site pointing a domain at 127.0.0.1 (DNS rebinding) carries its own Host
	if !s.hosts[r.Host] {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	// other sites cannot read our answers, but they can still send requests (a forged goodbye would end the game while it is played);
	// browsers mark those, while the game's own requests are same-origin and opening the window is "none"
	if sf := r.Header.Get("Sec-Fetch-Site"); sf != "" && sf != "same-origin" && sf != "none" {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	switch r.URL.Path {
	case "/__neoncity/id":
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"app": appID, "dir": s.root})
		return
	case "/__neoncity/ping":
		s.lastPing.Store(time.Now().UnixMilli())
		w.WriteHeader(http.StatusNoContent)
		return
	case "/__neoncity/bye":
		s.byeAt.Store(time.Now().UnixMilli())
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p := path.Clean("/" + r.URL.Path)
	if p == "/" {
		p = "/index.html"
	}
	full, ok := s.resolve(p)
	if !ok {
		http.NotFound(w, r)
		return
	}
	f, err := os.Open(full)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() { // no folder listings, no devices (CON, NUL on Windows)
		http.NotFound(w, r)
		return
	}
	ext := strings.ToLower(filepath.Ext(full))
	h := w.Header()
	if m, ok := mimes[ext]; ok {
		h.Set("Content-Type", m)
	} else {
		h.Set("Content-Type", "application/octet-stream")
	}
	h.Set("X-Content-Type-Options", "nosniff")
	if strings.HasPrefix(p, "/assets/") { // names carry a content hash: a new build gets new names
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		h.Set("Cache-Control", "no-cache")
	}
	http.ServeContent(w, r, "", st.ModTime(), f) // Range requests (world packs) are answered with 206
}

// resolve maps a cleaned URL path to a file under the root; hidden names, drive or stream syntax and anything outside the root are refused.
func (s *server) resolve(p string) (string, bool) {
	if strings.ContainsAny(p, "\\:\x00") {
		return "", false
	}
	for _, seg := range strings.Split(p, "/") {
		if strings.HasPrefix(seg, ".") {
			return "", false
		}
	}
	full := filepath.Join(s.root, filepath.FromSlash(p))
	rel, err := filepath.Rel(s.root, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	return full, true
}

// openWindow shows the game in a Chrome or Edge app window with its own profile, else in the default browser. It returns true when it
// waited for an app window that stayed open for a while and has now closed (the caller then exits).
func openWindow(url, data string) bool {
	if exe := findBrowser(); exe != "" {
		args := []string{"--app=" + url, "--user-data-dir=" + filepath.Join(data, "Browser"), "--no-first-run", "--no-default-browser-check",
			"--start-maximized", "--autoplay-policy=no-user-gesture-required"}
		cmd := exec.Command(exe, args...)
		if err := cmd.Start(); err == nil {
			log.Printf("window: %s", exe)
			t0 := time.Now()
			_ = cmd.Wait()
			// a quick return means the profile was already open and the window went to that browser: the page pings decide then
			return time.Since(t0) > 5*time.Second
		} else {
			log.Printf("could not start %s: %v", exe, err)
		}
	}
	log.Printf("window: default browser")
	if err := openDefault(url); err != nil {
		fail("브라우저를 열지 못했습니다: " + err.Error() + "\n\n브라우저에서 직접 " + url + " 을 열어 주세요.")
	}
	return false
}

// findBrowser returns the path of an installed Chrome or Edge ("" when there is none).
func findBrowser() string {
	var c []string
	switch runtime.GOOS {
	case "windows":
		pf, pf86, local := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")
		for _, base := range []string{pf, pf86, local} {
			if base != "" {
				c = append(c, filepath.Join(base, `Google\Chrome\Application\chrome.exe`))
			}
		}
		for _, base := range []string{pf86, pf} {
			if base != "" {
				c = append(c, filepath.Join(base, `Microsoft\Edge\Application\msedge.exe`))
			}
		}
	case "darwin":
		c = []string{"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"}
	default:
		for _, n := range []string{"google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"} {
			if p, err := exec.LookPath(n); err == nil {
				c = append(c, p)
			}
		}
	}
	for _, p := range c {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func openDefault(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}

// dataDir is where the launcher keeps its log, the chosen port and the app window's browser profile (with the saves): outside the game
// folder, so a new version unpacked elsewhere finds the same saves.
func dataDir() string {
	if runtime.GOOS == "windows" {
		if d := os.Getenv("LOCALAPPDATA"); d != "" {
			return filepath.Join(d, "NeonCity")
		}
	}
	if d, err := os.UserConfigDir(); err == nil {
		return filepath.Join(d, "NeonCity")
	}
	return filepath.Join(os.TempDir(), "NeonCity")
}

// setupLog appends to the log file, starting it over once it passes 1 MB.
func setupLog(file string) {
	if st, err := os.Stat(file); err == nil && st.Size() > 1<<20 {
		_ = os.Remove(file)
	}
	f, err := os.OpenFile(file, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	log.SetOutput(io.MultiWriter(f, os.Stderr))
}

// fail logs the message, shows it to the player and stops.
func fail(msg string) {
	log.Printf("error: %s", msg)
	showError("NeonCity", msg)
	os.Exit(1)
}
