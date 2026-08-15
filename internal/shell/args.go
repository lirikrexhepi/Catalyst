package shell

import "strings"

// TokenizeArgs splits a user-supplied launch-args string into argv, honouring
// single and double quotes so paths with spaces survive.
func TokenizeArgs(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	var (
		args    []string
		current strings.Builder
		quote   rune
		open    bool
	)

	flush := func() {
		if open || current.Len() > 0 {
			args = append(args, current.String())
			current.Reset()
			open = false
		}
	}

	for _, r := range raw {
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
				continue
			}
			current.WriteRune(r)
		case r == '\'' || r == '"':
			quote = r
			open = true
		case r == ' ' || r == '\t' || r == '\n' || r == '\r':
			flush()
		default:
			current.WriteRune(r)
		}
	}
	flush()
	return args
}
