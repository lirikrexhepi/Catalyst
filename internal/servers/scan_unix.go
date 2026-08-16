//go:build !windows

package servers

import (
	"bufio"
	"context"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

// listeningSockets uses lsof, which reports the owning PID alongside the port
// on both Linux and macOS.
func listeningSockets(ctx context.Context) ([]listener, error) {
	out, err := exec.CommandContext(ctx, "lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn").Output()
	if err != nil {
		return nil, err
	}

	var (
		results []listener
		pid     int
	)
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := scanner.Text()
		if len(line) < 2 {
			continue
		}
		switch line[0] {
		case 'p':
			pid, _ = strconv.Atoi(line[1:])
		case 'n':
			address, port, ok := splitAddress(line[1:])
			if ok && pid > 0 {
				results = append(results, listener{pid: pid, port: port, address: address})
			}
		}
	}
	return results, scanner.Err()
}

func splitAddress(value string) (string, int, bool) {
	index := strings.LastIndex(value, ":")
	if index < 0 {
		return "", 0, false
	}
	port, err := strconv.Atoi(value[index+1:])
	if err != nil {
		return "", 0, false
	}
	return value[:index], port, true
}

func processTable(ctx context.Context) (map[int]processInfo, error) {
	out, err := exec.CommandContext(ctx, "ps", "-eo", "pid=,ppid=,comm=,args=").Output()
	if err != nil {
		return nil, err
	}

	table := make(map[int]processInfo)
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 {
			continue
		}
		pid, err := strconv.Atoi(fields[0])
		if err != nil {
			continue
		}
		parent, _ := strconv.Atoi(fields[1])
		table[pid] = processInfo{
			pid:     pid,
			parent:  parent,
			name:    fields[2],
			command: strings.Join(fields[3:], " "),
		}
	}
	return table, scanner.Err()
}

// stop asks politely first: a dev server given SIGTERM releases its port and
// flushes state, where SIGKILL can leave sockets in TIME_WAIT.
func stop(ctx context.Context, pid int) error {
	if err := syscall.Kill(-pid, syscall.SIGTERM); err == nil {
		return nil
	}
	return syscall.Kill(pid, syscall.SIGTERM)
}
