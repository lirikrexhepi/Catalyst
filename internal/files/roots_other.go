//go:build !windows

package files

func roots() []Place {
	return []Place{{Name: "Computer", Path: "/"}}
}
