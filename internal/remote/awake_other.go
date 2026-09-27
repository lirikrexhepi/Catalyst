//go:build !windows

package remote

type awakeHold struct{}

func (h *awakeHold) set(bool) (bool, error) {
	return false, nil
}
