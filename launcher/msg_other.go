//go:build !windows

package main

import (
	"fmt"
	"os"
)

// showError prints the message (other systems start the launcher from a terminal or keep its output).
func showError(title, msg string) { fmt.Fprintln(os.Stderr, title+": "+msg) }
