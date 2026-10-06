//go:build windows

package main

import (
	"bytes"
	"errors"
	"image/png"
	"os"
	"sync"
	"syscall"
	"unsafe"
)

var (
	iconUser32 = syscall.NewLazyDLL("user32.dll")
	iconGdi32  = syscall.NewLazyDLL("gdi32.dll")

	procCreateIconIndirect = iconUser32.NewProc("CreateIconIndirect")
	procDestroyIcon        = iconUser32.NewProc("DestroyIcon")
	procEnumWindows        = iconUser32.NewProc("EnumWindows")
	procGetWindowThreadPID = iconUser32.NewProc("GetWindowThreadProcessId")
	procSendMessageW       = iconUser32.NewProc("SendMessageW")
	procIsWindowVisible    = iconUser32.NewProc("IsWindowVisible")
	procGetDC              = iconUser32.NewProc("GetDC")
	procReleaseDC          = iconUser32.NewProc("ReleaseDC")
	procSetClassLongPtr    = iconUser32.NewProc("SetClassLongPtrW")

	procCreateDIBSection = iconGdi32.NewProc("CreateDIBSection")
	procCreateBitmap     = iconGdi32.NewProc("CreateBitmap")
	procDeleteObject     = iconGdi32.NewProc("DeleteObject")
	procSetDIBits        = iconGdi32.NewProc("SetDIBits")

	windowIconMu sync.Mutex
	windowIcons  [2]uintptr
)

const (
	wmSetIcon = 0x0080
	iconSmall = 0
	iconBig   = 1

	gclpHicon   = uintptr(0xFFFFFFF2)
	gclpHiconSm = uintptr(0xFFFFFFF0)
)

type bitmapInfoHeader struct {
	size          uint32
	width         int32
	height        int32
	planes        uint16
	bitCount      uint16
	compression   uint32
	sizeImage     uint32
	xPelsPerMeter int32
	yPelsPerMeter int32
	clrUsed       uint32
	clrImportant  uint32
}

type iconInfo struct {
	fIcon    int32
	xHotspot uint32
	yHotspot uint32
	hbmMask  uintptr
	hbmColor uintptr
}

func pngToHICON(data []byte) (uintptr, error) {
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return 0, err
	}
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w <= 0 || h <= 0 || w > 256 || h > 256 {
		return 0, errors.New("unexpected icon dimensions")
	}
	hdc, _, _ := procGetDC.Call(0)
	if hdc == 0 {
		return 0, errors.New("GetDC failed")
	}
	defer procReleaseDC.Call(0, hdc)

	var bmi bitmapInfoHeader
	bmi.size = uint32(unsafe.Sizeof(bmi))
	bmi.width = int32(w)
	bmi.height = int32(-h)
	bmi.planes = 1
	bmi.bitCount = 32

	pixels := make([]byte, w*h*4)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r, g, b, a := img.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			i := (y*w + x) * 4
			pixels[i+0] = byte(b >> 8)
			pixels[i+1] = byte(g >> 8)
			pixels[i+2] = byte(r >> 8)
			pixels[i+3] = byte(a >> 8)
		}
	}
	var dibBits unsafe.Pointer
	hbmColor, _, _ := procCreateDIBSection.Call(
		hdc,
		uintptr(unsafe.Pointer(&bmi)),
		0,
		uintptr(unsafe.Pointer(&dibBits)),
		0, 0,
	)
	if hbmColor == 0 {
		return 0, errors.New("CreateDIBSection failed")
	}
	set, _, _ := procSetDIBits.Call(
		hdc,
		hbmColor,
		0,
		uintptr(h),
		uintptr(unsafe.Pointer(&pixels[0])),
		uintptr(unsafe.Pointer(&bmi)),
		0,
	)
	if set == 0 {
		procDeleteObject.Call(hbmColor)
		return 0, errors.New("SetDIBits failed")
	}
	hbmMask, _, _ := procCreateBitmap.Call(uintptr(w), uintptr(h), 1, 1, 0)
	if hbmMask == 0 {
		procDeleteObject.Call(hbmColor)
		return 0, errors.New("CreateBitmap failed")
	}
	ii := iconInfo{fIcon: 1, hbmMask: hbmMask, hbmColor: hbmColor}
	hIcon, _, _ := procCreateIconIndirect.Call(uintptr(unsafe.Pointer(&ii)))
	procDeleteObject.Call(hbmColor)
	procDeleteObject.Call(hbmMask)
	if hIcon == 0 {
		return 0, errors.New("CreateIconIndirect failed")
	}
	return hIcon, nil
}

func processWindows() []uintptr {
	pid := uint32(os.Getpid())
	var found []uintptr
	callback := syscall.NewCallback(func(hwnd uintptr, _ uintptr) uintptr {
		var owner uint32
		procGetWindowThreadPID.Call(hwnd, uintptr(unsafe.Pointer(&owner)))
		if owner == pid {
			if visible, _, _ := procIsWindowVisible.Call(hwnd); visible != 0 {
				found = append(found, hwnd)
			}
		}
		return 1
	})
	procEnumWindows.Call(callback, 0)
	return found
}

func setWindowIcon(small, big []byte) error {
	smallIcon, err := pngToHICON(small)
	if err != nil {
		return err
	}
	bigIcon, err := pngToHICON(big)
	if err != nil {
		procDestroyIcon.Call(smallIcon)
		return err
	}
	windows := processWindows()
	if len(windows) == 0 {
		procDestroyIcon.Call(smallIcon)
		procDestroyIcon.Call(bigIcon)
		return errors.New("no window to set the icon on")
	}
	for _, hwnd := range windows {
		procSendMessageW.Call(hwnd, wmSetIcon, iconSmall, smallIcon)
		procSendMessageW.Call(hwnd, wmSetIcon, iconBig, bigIcon)
		procSetClassLongPtr.Call(hwnd, gclpHiconSm, smallIcon)
		procSetClassLongPtr.Call(hwnd, gclpHicon, bigIcon)
	}
	windowIconMu.Lock()
	previous := windowIcons
	windowIcons = [2]uintptr{smallIcon, bigIcon}
	windowIconMu.Unlock()
	for _, icon := range previous {
		if icon != 0 {
			procDestroyIcon.Call(icon)
		}
	}
	return nil
}
