package git

import (
	"bufio"
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	"composer/internal/domain"
)

// maxDiffLines caps what one file's diff may send across the bridge. A
// generated lockfile or a vendored bundle can run to hundreds of thousands of
// lines, which no one reads and which would stall the window.
const maxDiffLines = 4000

// maxUntrackedBytes bounds reading a new file off disk to render it as added.
const maxUntrackedBytes = 2 << 20

// FileDiff returns one file's changes, ready to render.
//
// staged selects which side of the index to show: a file both staged and edited
// again has two different diffs, and the list shows it as two rows.
func (r *Repo) FileDiff(ctx context.Context, path string, staged bool) (domain.DiffFile, error) {
	args := []string{"diff", "--no-color", "--no-ext-diff", "-U3"}
	if staged {
		args = append(args, "--cached")
	}
	args = append(args, "--", path)

	raw, err := runRaw(ctx, r.Root, args...)
	if err != nil {
		return domain.DiffFile{}, err
	}
	// An untracked file has nothing to diff against, so git returns nothing and
	// the content has to be read directly to show it as added.
	if strings.TrimSpace(raw) == "" && !staged {
		return r.untrackedDiff(path)
	}
	return parseUnified(path, raw), nil
}

// CommitDiff returns what one commit changed, across every file it touched.
func (r *Repo) CommitDiff(ctx context.Context, sha string) ([]domain.DiffFile, error) {
	raw, err := runRaw(ctx, r.Root, "show", "--no-color", "--no-ext-diff", "-U3", "--format=", sha)
	if err != nil {
		return nil, err
	}
	return splitFileDiffs(raw), nil
}

// untrackedDiff renders a file git is not tracking as entirely added.
func (r *Repo) untrackedDiff(path string) (domain.DiffFile, error) {
	diff := domain.DiffFile{Path: path}

	full := filepath.Join(r.Root, filepath.FromSlash(path))
	info, err := os.Stat(full)
	if err != nil {
		return diff, err
	}
	if info.IsDir() {
		return diff, nil
	}
	if info.Size() > maxUntrackedBytes {
		diff.Truncated = true
		return diff, nil
	}

	body, err := os.ReadFile(full)
	if err != nil {
		return diff, err
	}
	if !utf8.Valid(body) || strings.IndexByte(string(body), 0) >= 0 {
		diff.Binary = true
		return diff, nil
	}

	lines := strings.Split(strings.TrimSuffix(string(body), "\n"), "\n")
	hunk := domain.DiffHunk{Header: "@@ -0,0 +1," + strconv.Itoa(len(lines)) + " @@"}
	for i, line := range lines {
		if len(hunk.Lines) >= maxDiffLines {
			diff.Truncated = true
			break
		}
		hunk.Lines = append(hunk.Lines, domain.DiffLine{
			Kind:    domain.DiffAdded,
			New:     i + 1,
			Content: line,
		})
	}

	diff.Hunks = []domain.DiffHunk{hunk}
	diff.Insertions = len(hunk.Lines)
	return diff, nil
}

// splitFileDiffs breaks a multi-file diff into one entry per file.
func splitFileDiffs(raw string) []domain.DiffFile {
	var diffs []domain.DiffFile

	var current []string
	flush := func() {
		if len(current) == 0 {
			return
		}
		body := strings.Join(current, "\n")
		diffs = append(diffs, parseUnified(pathFromHeader(current[0]), body))
		current = nil
	}

	for _, line := range strings.Split(raw, "\n") {
		if strings.HasPrefix(line, "diff --git ") {
			flush()
		}
		current = append(current, line)
	}
	flush()
	return diffs
}

// pathFromHeader reads the new-side path out of a `diff --git a/x b/x` line.
//
// The two halves are split on " b/" rather than on whitespace because either
// path may itself contain spaces.
func pathFromHeader(header string) string {
	rest := strings.TrimPrefix(header, "diff --git ")
	if index := strings.Index(rest, " b/"); index >= 0 {
		return rest[index+3:]
	}
	return strings.TrimPrefix(rest, "a/")
}

// parseUnified turns unified diff text into rows carrying their line numbers.
//
// The counters come from each hunk header rather than being inferred, so a diff
// with context suppressed or with several hunks still numbers correctly.
func parseUnified(path, raw string) domain.DiffFile {
	diff := domain.DiffFile{Path: path}

	var hunk *domain.DiffHunk
	oldLine, newLine := 0, 0
	total := 0

	scanner := bufio.NewScanner(strings.NewReader(raw))
	scanner.Buffer(make([]byte, 0, 64*1024), 8<<20)

	for scanner.Scan() {
		line := scanner.Text()

		switch {
		case strings.HasPrefix(line, "@@"):
			if hunk != nil {
				diff.Hunks = append(diff.Hunks, *hunk)
			}
			oldLine, newLine = hunkStarts(line)
			header := line
			hunk = &domain.DiffHunk{Header: header}
			continue

		case strings.HasPrefix(line, "rename from "):
			diff.OldPath = strings.TrimPrefix(line, "rename from ")
			continue

		case strings.HasPrefix(line, "Binary files "), strings.HasPrefix(line, "GIT binary patch"):
			diff.Binary = true
			continue

		case hunk == nil:
			// Still in the header block: index lines, mode changes, ---/+++.
			continue

		// A "\ No newline at end of file" marker annotates the previous row
		// rather than being a row of its own.
		case strings.HasPrefix(line, "\\"):
			continue
		}

		if total >= maxDiffLines {
			diff.Truncated = true
			break
		}

		row := domain.DiffLine{}
		switch {
		case strings.HasPrefix(line, "+"):
			row = domain.DiffLine{Kind: domain.DiffAdded, New: newLine, Content: line[1:]}
			newLine++
			diff.Insertions++
		case strings.HasPrefix(line, "-"):
			row = domain.DiffLine{Kind: domain.DiffRemoved, Old: oldLine, Content: line[1:]}
			oldLine++
			diff.Deletions++
		default:
			content := line
			if strings.HasPrefix(line, " ") {
				content = line[1:]
			}
			row = domain.DiffLine{Kind: domain.DiffContext, Old: oldLine, New: newLine, Content: content}
			oldLine++
			newLine++
		}

		hunk.Lines = append(hunk.Lines, row)
		total++
	}

	if hunk != nil {
		diff.Hunks = append(diff.Hunks, *hunk)
	}
	return diff
}

// hunkStarts reads the first old and new line numbers from `@@ -a,b +c,d @@`.
func hunkStarts(header string) (int, int) {
	fields := strings.Fields(header)
	old, next := 0, 0
	for _, field := range fields {
		switch {
		case strings.HasPrefix(field, "-"):
			old = leadingNumber(field[1:])
		case strings.HasPrefix(field, "+"):
			next = leadingNumber(field[1:])
		}
	}
	return old, next
}

func leadingNumber(field string) int {
	if comma := strings.IndexByte(field, ','); comma >= 0 {
		field = field[:comma]
	}
	value, _ := strconv.Atoi(field)
	return value
}
