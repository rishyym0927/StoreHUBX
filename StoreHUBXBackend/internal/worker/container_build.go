package worker

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/rishyym0927/storehubx/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// buildNetworkName is a dedicated user-defined bridge for install traffic.
// Using a named network rather than the default bridge keeps build containers
// off whatever network the worker's own infrastructure (Mongo, MinIO, Redis)
// is reachable on.
const buildNetworkName = "storehubx-build-net"

// containerUID/GID is the unprivileged account builds run as inside the
// container. The bind-mounted repo is chowned to match.
const containerUID, containerGID = 1000, 1000

var (
	dockerOnce   sync.Once
	dockerPath   string
	dockerUsable bool
	networkOnce  sync.Once
	prewarmOnce  sync.Once
)

// SandboxAvailable reports whether builds can run in a container. It is
// resolved once per process: Docker either exists at startup or it doesn't.
//
// When false, the caller falls back to building directly on the host, which is
// the pre-existing behavior — sandboxing degrades rather than failing builds.
func SandboxAvailable() bool {
	dockerOnce.Do(func() {
		if os.Getenv("BUILD_SANDBOX_ENABLED") == "false" {
			return
		}
		path, err := exec.LookPath("docker")
		if err != nil {
			return
		}
		// Presence of the binary isn't enough; the daemon must answer.
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := exec.CommandContext(ctx, path, "info").Run(); err != nil {
			return
		}
		dockerPath = path
		dockerUsable = true
	})
	return dockerUsable
}

// PrewarmSandbox pulls the default Node image in the background so the first
// build doesn't pay for it inside its own timeout budget. Only the default
// version is fetched; other majors pull lazily when a repo actually asks for
// one, rather than eagerly spending ~1.5GB of disk on all three.
func PrewarmSandbox(ctx context.Context) {
	if !SandboxAvailable() {
		return
	}
	prewarmOnce.Do(func() {
		go func() {
			image := nodeImage(models.DefaultNodeVersion)
			pullCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
			defer cancel()
			if err := exec.CommandContext(pullCtx, dockerPath, "pull", image).Run(); err != nil {
				fmt.Printf("[WORKER] prewarm pull of %s failed (will pull on demand): %v\n", image, err)
				return
			}
			fmt.Printf("[WORKER] prewarmed %s\n", image)
		}()
	})
}

// nodeImage maps a validated Node version onto its image tag. Validate has
// already constrained the version to the supported set, so this cannot be
// steered into pulling an arbitrary image.
func nodeImage(version string) string {
	return "node:" + version + "-slim"
}

// ensureBuildNetwork creates the isolated bridge network if it doesn't exist.
func ensureBuildNetwork(ctx context.Context) error {
	var err error
	networkOnce.Do(func() {
		inspect := exec.CommandContext(ctx, dockerPath, "network", "inspect", buildNetworkName)
		if inspect.Run() == nil {
			return // already exists
		}
		create := exec.CommandContext(ctx, dockerPath, "network", "create", buildNetworkName)
		var stderr bytes.Buffer
		create.Stderr = &stderr
		if createErr := create.Run(); createErr != nil {
			// A concurrent worker may have won the race; re-inspect before failing.
			if exec.CommandContext(ctx, dockerPath, "network", "inspect", buildNetworkName).Run() != nil {
				err = fmt.Errorf("create build network: %v: %s", createErr, strings.TrimSpace(stderr.String()))
			}
		}
	})
	return err
}

// sandboxError marks a failure of the build infrastructure rather than of the
// repository being built. The distinction matters operationally: a build-script
// failure is the user's problem and should surface their compiler output, while
// a sandbox failure is ours and should page us, not them.
type sandboxError struct{ err error }

func (e *sandboxError) Error() string { return "sandbox error: " + e.err.Error() }
func (e *sandboxError) Unwrap() error { return e.err }

// IsSandboxError reports whether err came from the build infrastructure.
func IsSandboxError(err error) bool {
	var se *sandboxError
	return errors.As(err, &se)
}

func containerTimeout() time.Duration {
	if v := os.Getenv("BUILD_CONTAINER_TIMEOUT"); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return buildStepTimeout
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// runContainerizedBuild runs a validated plan inside Docker, in two phases.
//
// The split exists because the two phases have opposite needs: installing
// dependencies requires network access to a registry, while running the repo's
// own build script requires none. Keeping them in one container would mean
// granting the arbitrary-code phase the network access only the install phase
// legitimately needs.
//
//	Phase A (install): isolated bridge network, reaches the registry
//	Phase B (build):   --network=none, no egress at all
func (p *Processor) runContainerizedBuild(ctx context.Context, jobID primitive.ObjectID, repoRoot string, plan *models.BuildPlan) error {
	if err := ensureBuildNetwork(ctx); err != nil {
		return &sandboxError{err}
	}

	// The container runs as uid 1000, so the bind-mounted tree must be
	// writable by it. Failing this silently would mean either a confusing
	// permission error mid-build or a temptation to run as root.
	if err := chownTree(ctx, repoRoot, containerUID, containerGID); err != nil {
		p.logPush(ctx, jobID, "[ERROR] failed to prepare sandbox filesystem permissions")
		return &sandboxError{err}
	}

	// Hand the tree back to whoever this process runs as once the container is
	// done with it. Everything after the build — injecting metadata into
	// index.html, reading files to upload — happens in this process, and would
	// otherwise hit permission errors on any host where the worker isn't uid
	// 1000. Deferred so it also runs when the build fails, leaving the
	// workspace inspectable and cleanable.
	defer func() {
		if err := chownTree(context.WithoutCancel(ctx), repoRoot, os.Getuid(), os.Getgid()); err != nil {
			p.logPush(ctx, jobID, fmt.Sprintf("[WARN] could not restore workspace ownership: %v", err))
		}
	}()

	image := nodeImage(plan.NodeVersion)

	if len(plan.InstallCmd) > 0 {
		p.logPush(ctx, jobID, fmt.Sprintf("[SANDBOX] install phase (%s, network=%s)", image, buildNetworkName))
		err := p.runPhase(ctx, jobID, phaseSpec{
			name:     "install",
			repoRoot: repoRoot,
			workDir:  plan.InstallDir,
			image:    image,
			argv:     plan.InstallCmd,
			network:  buildNetworkName,
		})
		if err != nil {
			return err
		}
	}

	if len(plan.BuildCmd) == 0 {
		return nil // static site: nothing to build
	}

	p.logPush(ctx, jobID, fmt.Sprintf("[SANDBOX] build phase (%s, network=none)", image))
	err := p.runPhase(ctx, jobID, phaseSpec{
		name:     "build",
		repoRoot: repoRoot,
		workDir:  plan.BuildDir,
		image:    image,
		argv:     plan.BuildCmd,
		network:  "none",
	})
	if err == nil {
		return nil
	}

	// Some builds legitimately fetch at build time (webfonts, source-map
	// upload, remote content). Rather than weaken the default for everyone,
	// the network-enabled retry is opt-in per deployment.
	if IsSandboxError(err) || os.Getenv("BUILD_ALLOW_BUILD_NETWORK") != "true" {
		return err
	}

	p.logPush(ctx, jobID, "[SANDBOX] build phase retried with network (BUILD_ALLOW_BUILD_NETWORK=true)")
	return p.runPhase(ctx, jobID, phaseSpec{
		name:     "build-retry",
		repoRoot: repoRoot,
		workDir:  plan.BuildDir,
		image:    image,
		argv:     plan.BuildCmd,
		network:  buildNetworkName,
	})
}

type phaseSpec struct {
	name     string
	repoRoot string
	workDir  string // relative to repoRoot
	image    string
	argv     []string
	network  string
}

// runPhase executes one container. argv comes from a validated BuildPlan, so
// it is a known-safe shape rather than free text — that check happens in
// buildplan.Validate, not here.
func (p *Processor) runPhase(ctx context.Context, jobID primitive.ObjectID, spec phaseSpec) error {
	timeout := containerTimeout()
	phaseCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	name := fmt.Sprintf("storehubx-build-%s-%s", jobID.Hex(), spec.name)

	// --rm is honored by the daemon when the container exits on its own. If
	// this process is killed first (job timeout, worker shutdown), the
	// container keeps running and --rm never fires — so remove it explicitly
	// on every exit path. Uses context.Background() because phaseCtx is
	// usually already cancelled by the time cleanup runs.
	defer func() {
		rmCtx, rmCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer rmCancel()
		_ = exec.CommandContext(rmCtx, dockerPath, "rm", "-f", name).Run()
	}()

	workDir := "/workspace"
	if spec.workDir != "" && spec.workDir != "." {
		workDir = "/workspace/" + filepath.ToSlash(spec.workDir)
	}

	args := []string{
		"run", "--rm",
		"--name", name,
		"--network", spec.network,
		"--memory", envOrDefault("BUILD_CONTAINER_MEMORY", "1g"),
		"--cpus", envOrDefault("BUILD_CONTAINER_CPUS", "1.5"),
		"--pids-limit", "512",
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--user", fmt.Sprintf("%d:%d", containerUID, containerGID),
		// npm needs a writable HOME and cache; without these it tries to write
		// to a home directory that doesn't exist for uid 1000 and dies.
		"-e", "HOME=/tmp",
		"-e", "npm_config_cache=/tmp/.npm",
		"-e", "CI=true",
		"--tmpfs", "/tmp:exec",
		// Mount the whole repo, not just the build dir, so a workspace install
		// at the repo root can see sibling packages.
		"-v", spec.repoRoot + ":/workspace",
		"-w", workDir,
		spec.image,
		"sh", "-c", strings.Join(spec.argv, " "),
	}

	cmd := exec.CommandContext(phaseCtx, dockerPath, args...)

	outPipe, err := cmd.StdoutPipe()
	if err != nil {
		return &sandboxError{fmt.Errorf("stdout pipe: %w", err)}
	}
	errPipe, err := cmd.StderrPipe()
	if err != nil {
		return &sandboxError{fmt.Errorf("stderr pipe: %w", err)}
	}

	if err := cmd.Start(); err != nil {
		return &sandboxError{fmt.Errorf("start docker run: %w", err)}
	}

	// Keep a bounded tail of stderr so a failure message can carry the part of
	// the output that actually explains it.
	var stderrTail tail
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		streamPipe(ctx, outPipe, func(line string) {
			p.logPush(ctx, jobID, fmt.Sprintf("[%s] %s", spec.name, line))
		})
	}()
	go func() {
		defer wg.Done()
		streamPipe(ctx, errPipe, func(line string) {
			stderrTail.add(line)
			p.logPush(ctx, jobID, fmt.Sprintf("[%s ERROR] %s", spec.name, line))
		})
	}()
	wg.Wait()

	err = cmd.Wait()
	if err == nil {
		return nil
	}

	if phaseCtx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("%s phase timed out after %s", spec.name, timeout)
	}

	// An ExitError means docker ran and the command inside returned non-zero:
	// the repository's own build failed. Anything else means we couldn't run
	// the container at all, which is our problem, not the user's.
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		detail := stderrTail.String()
		if detail == "" {
			detail = "(no stderr output)"
		}
		return fmt.Errorf("%s failed (exit %d): %s", spec.name, exitErr.ExitCode(), detail)
	}
	return &sandboxError{fmt.Errorf("%s phase could not run: %w", spec.name, err)}
}

// chownTree reassigns ownership of the extracted repo.
//
// Done via a throwaway root container rather than syscall.Chown so the worker
// itself doesn't need to be root, and so it behaves the same regardless of who
// the worker runs as.
func chownTree(ctx context.Context, dir string, uid, gid int) error {
	chownCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(chownCtx, dockerPath, "run", "--rm",
		"--network", "none",
		"-v", dir+":/workspace",
		"alpine:3",
		"chown", "-R", fmt.Sprintf("%d:%d", uid, gid), "/workspace",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("chown workspace: %v: %s", err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

// maxLogLine caps a single streamed line so a build that emits one enormous
// line (minified output, a progress bar without newlines) can't push an
// unbounded string into the job's Mongo document.
const maxLogLine = 2000

// streamPipe reads r line by line and hands each non-empty line to emit.
// Unlike raw chunked reads, this keeps log entries aligned to output lines,
// which matters because each one becomes a separate entry in BuildJob.logs.
func streamPipe(ctx context.Context, r io.Reader, emit func(string)) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		if ctx.Err() != nil {
			return
		}
		line := strings.TrimRight(scanner.Text(), "\r\n")
		if strings.TrimSpace(line) == "" {
			continue
		}
		if len(line) > maxLogLine {
			line = line[:maxLogLine] + " …(truncated)"
		}
		emit(line)
	}
}

// maxTailLines bounds how much stderr is retained for the failure message.
const maxTailLines = 20

// tail keeps the last N lines written to it.
type tail struct {
	mu    sync.Mutex
	lines []string
}

func (t *tail) add(line string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.lines = append(t.lines, line)
	if len(t.lines) > maxTailLines {
		t.lines = t.lines[len(t.lines)-maxTailLines:]
	}
}

func (t *tail) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return strings.Join(t.lines, "\n")
}
