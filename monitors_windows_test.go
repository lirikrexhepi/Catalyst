//go:build windows

package main

import "testing"

func TestMonitorStatusReadsWithoutSideEffects(t *testing.T) {
	if n := monitorCount(); n < 1 {
		t.Fatalf("monitor count = %d", n)
	}
	if monitorsLikelyOff() {
		t.Fatal("monitors reported off before anything turned them off")
	}
	if lastInputTick() == 0 {
		t.Fatal("no last input time")
	}
}
