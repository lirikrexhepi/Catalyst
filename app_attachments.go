package main

import (
	"composer/internal/attachments"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SaveAttachment stages pasted or dropped bytes as a real file.
//
// Every CLI adapter takes a filesystem path, so clipboard data cannot be sent
// as-is; it has to exist on disk first. payload is base64 (a plain data URL is
// also accepted) because a byte slice would cross the JS bridge as a JSON
// number array many times its size.
func (a *App) SaveAttachment(name, mime, payload string) (attachments.Attachment, error) {
	return a.attachments.Save(name, mime, payload)
}

// ChooseAttachments opens the OS file picker and records what was chosen.
//
// The files are referenced in place rather than copied: they are already on
// disk where the CLI can read them, and copying would leave stale duplicates.
// A cancelled dialog yields an empty list, not an error.
func (a *App) ChooseAttachments() ([]attachments.Attachment, error) {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Attach files",
	})
	if err != nil {
		return nil, err
	}

	chosen := make([]attachments.Attachment, 0, len(paths))
	for _, path := range paths {
		attachment, err := a.attachments.Adopt(path)
		if err != nil {
			// One unreadable pick must not discard the rest of the selection.
			continue
		}
		chosen = append(chosen, attachment)
	}
	return chosen, nil
}

// PreviewAttachment returns an image as a data URL so the composer can show a
// thumbnail of what was attached. Non-images and oversized files return an
// error, which the caller treats as "show the icon instead".
func (a *App) PreviewAttachment(path string) (string, error) {
	return a.attachments.Preview(path)
}

// DiscardAttachment drops a staged file. Only files Composer itself wrote are
// deleted; one the user picked from their own disk is merely forgotten.
func (a *App) DiscardAttachment(id string) {
	a.attachments.Discard(id)
}
