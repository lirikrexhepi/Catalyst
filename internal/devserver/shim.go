package devserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	ShimName     = "composer-serve"
	TaskShimName = "composer-task"
)

func shimFileName(names ...string) string {
	name := ShimName
	if len(names) > 0 && names[0] != "" {
		name = names[0]
	}
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func IsShim(argv0 string) bool {
	name := strings.ToLower(filepath.Base(argv0))
	name = strings.TrimSuffix(name, ".exe")
	return name == ShimName || name == TaskShimName
}

func InstallShim(binDir string) (string, error) {
	self, err := os.Executable()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		return "", err
	}

	for _, name := range []string{ShimName, TaskShimName} {
		target := filepath.Join(binDir, shimFileName(name))
		if upToDate(self, target) {
			continue
		}

		_ = os.Remove(target)
		if err := os.Link(self, target); err == nil {
			continue
		}
		if err := copyFile(self, target); err != nil {
			return "", err
		}
	}
	return binDir, nil
}

func upToDate(self, target string) bool {
	source, err := os.Stat(self)
	if err != nil {
		return false
	}
	existing, err := os.Stat(target)
	if err != nil {
		return false
	}
	return existing.Size() == source.Size() && !existing.ModTime().Before(source.ModTime())
}

func copyFile(from, to string) error {
	source, err := os.Open(from)
	if err != nil {
		return err
	}
	defer source.Close()

	destination, err := os.OpenFile(to, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer destination.Close()

	_, err = io.Copy(destination, source)
	return err
}

func RunShim(args []string) int {
	execName := strings.ToLower(filepath.Base(os.Args[0]))
	execName = strings.TrimSuffix(execName, ".exe")
	if execName == TaskShimName {
		return RunTaskShim(args)
	}
	return RunServeShim(args)
}

func RunServeShim(args []string) int {
	if len(args) == 0 {
		fmt.Fprintf(os.Stderr, "usage: %s <command> [args...]\n", ShimName)
		return 2
	}

	endpoint := os.Getenv(EnvURL)
	token := os.Getenv(EnvToken)
	if endpoint == "" || token == "" {
		fmt.Fprintf(os.Stderr, "%s: not running inside a Composer session\n", ShimName)
		return 1
	}

	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", ShimName, err)
		return 1
	}

	payload, err := json.Marshal(startRequest{
		Command:   args[0],
		Args:      args[1:],
		Cwd:       cwd,
		Thread:    os.Getenv(EnvOwner),
		CallerPID: os.Getpid(),
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", ShimName, err)
		return 1
	}

	request, err := http.NewRequest(http.MethodPost, strings.TrimRight(endpoint, "/")+"/start", bytes.NewReader(payload))
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", ShimName, err)
		return 1
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 15 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", ShimName, err)
		return 1
	}
	defer response.Body.Close()

	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "%s: %s\n", ShimName, strings.TrimSpace(string(body)))
		return 1
	}

	var result startResponse
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", ShimName, err)
		return 1
	}

	fmt.Printf("Started %q under Composer (pid %d, id %s) in %s.\n", result.Command, result.PID, result.ID, result.Cwd)
	fmt.Printf("It keeps running after this turn ends. Composer's Servers panel can stop it.\n")
	return 0
}

func RunTaskShim(args []string) int {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		fmt.Fprintf(os.Stderr, "Usage: %s <action> [arguments...]\n", TaskShimName)
		fmt.Fprintf(os.Stderr, "Actions:\n")
		fmt.Fprintf(os.Stderr, "  set <task1> [task2...]   Replace current tasklist with new items\n")
		fmt.Fprintf(os.Stderr, "  add <task>               Append a new task\n")
		fmt.Fprintf(os.Stderr, "  start <index|name>       Mark task as in-progress\n")
		fmt.Fprintf(os.Stderr, "  done <index|name>        Mark task as completed\n")
		fmt.Fprintf(os.Stderr, "  toggle <index|name>      Toggle completed / pending\n")
		fmt.Fprintf(os.Stderr, "  remove <index|name>      Remove a task\n")
		fmt.Fprintf(os.Stderr, "  list                     Show current tasks\n")
		return 2
	}

	endpoint := os.Getenv(EnvURL)
	token := os.Getenv(EnvToken)
	if endpoint == "" || token == "" {
		fmt.Fprintf(os.Stderr, "%s: not running inside a Composer session\n", TaskShimName)
		return 1
	}

	action := strings.ToLower(args[0])
	req := taskRequest{
		Action:    action,
		Thread:    os.Getenv(EnvOwner),
		CallerPID: os.Getpid(),
	}

	switch action {
	case "set":
		if len(args) < 2 {
			fmt.Fprintf(os.Stderr, "%s set requires at least one task item\n", TaskShimName)
			return 2
		}
		req.Tasks = args[1:]
	case "add":
		if len(args) < 2 {
			fmt.Fprintf(os.Stderr, "%s add requires a task description\n", TaskShimName)
			return 2
		}
		req.Item = strings.Join(args[1:], " ")
	case "start", "done", "complete", "toggle", "remove", "delete", "rm":
		if len(args) < 2 {
			fmt.Fprintf(os.Stderr, "%s %s requires task index or title\n", TaskShimName, action)
			return 2
		}
		req.Target = strings.Join(args[1:], " ")
	case "list":
		// no extra args
	default:
		fmt.Fprintf(os.Stderr, "unknown action %q\n", action)
		return 2
	}

	payload, err := json.Marshal(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", TaskShimName, err)
		return 1
	}

	request, err := http.NewRequest(http.MethodPost, strings.TrimRight(endpoint, "/")+"/tasks", bytes.NewReader(payload))
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", TaskShimName, err)
		return 1
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 10 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", TaskShimName, err)
		return 1
	}
	defer response.Body.Close()

	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "%s: %s\n", TaskShimName, strings.TrimSpace(string(body)))
		return 1
	}

	var res taskResponse
	if err := json.Unmarshal(body, &res); err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", TaskShimName, err)
		return 1
	}

	if res.Error != "" {
		fmt.Fprintf(os.Stderr, "%s error: %s\n", TaskShimName, res.Error)
		return 1
	}

	fmt.Println("[Composer Tasklist]")
	if len(res.Tasks) == 0 {
		fmt.Println("  (No tasks)")
	} else {
		for i, t := range res.Tasks {
			var symbol string
			switch t.Status {
			case "completed":
				symbol = "[x]"
			case "in_progress":
				symbol = "[>]"
			default:
				symbol = "[ ]"
			}
			fmt.Printf("  %d. %s %s\n", i+1, symbol, t.Content)
		}
	}

	return 0
}

func Brief() string {
	return "[Composer Servers]\n" +
		"To start anything long-running (dev server, watcher, daemon), prefix it with `" +
		ShimName + "` — for example `" + ShimName + " npm run dev`. " +
		"It returns immediately, and Composer keeps the process alive after this turn ends, " +
		"listed in its Servers panel.\n\n" +
		"[Composer Tasklist]\n" +
		"When the user asks you to implement, fix, or change 3 or more distinct things that require modifying code/files, or if there is already an active tasklist in this session:\n" +
		"- Track them using the `" + TaskShimName + "` command so the user has clear real-time visibility in the Tasklist tab.\n" +
		"- Keep each task description concise (3 to 7 words each) to save tokens.\n" +
		"- To initialize the tasklist: `" + TaskShimName + " set \"Task one\" \"Task two\" \"Task three\"`\n" +
		"- When the user sends follow-up messages requesting new items, append them: `" + TaskShimName + " add \"New task description\"`\n" +
		"- When beginning work on a task: `" + TaskShimName + " start <number>`\n" +
		"- When finishing a task: `" + TaskShimName + " done <number>`\n" +
		"- Note: Only track actionable tasks that involve editing code or files. Do not create tasklist items for conversational explanations or simple questions."
}

