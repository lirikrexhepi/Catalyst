package auth

import (
	"context"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"sync"
	"time"
)

type OAuthHandler struct {
	httpServer *http.Server
	mutex      sync.Mutex
}

func NewOAuthHandler() *OAuthHandler {
	return &OAuthHandler{}
}

func (oauthHandler *OAuthHandler) StartFlow(parentContext context.Context, provider ProviderID) (*Credential, error) {
	codeChannel := make(chan string, 1)
	errorChannel := make(chan error, 1)

	serverMux := http.NewServeMux()
	serverMux.HandleFunc("/callback", func(responseWriter http.ResponseWriter, request *http.Request) {
		authorizationCode := request.URL.Query().Get("code")
		if authorizationCode == "" {
			http.Error(responseWriter, "Authorization code missing", http.StatusBadRequest)
			errorChannel <- fmt.Errorf("callback missing authorization code")
			return
		}
		responseWriter.Header().Set("Content-Type", "text/html")
		fmt.Fprint(responseWriter, `<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#101010;color:#fff;"><h2>Authentication Successful!</h2><p>You can close this tab and return to Catalyst.</p></body></html>`)
		codeChannel <- authorizationCode
	})

	oauthHandler.mutex.Lock()
	oauthHandler.httpServer = &http.Server{
		Addr:    "localhost:8080",
		Handler: serverMux,
	}
	oauthHandler.mutex.Unlock()

	go func() {
		if err := oauthHandler.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errorChannel <- err
		}
	}()

	authURL := getProviderAuthURL(provider)
	if err := openBrowser(authURL); err != nil {
		oauthHandler.Shutdown()
		return nil, fmt.Errorf("failed to open browser: %w", err)
	}

	select {
	case code := <-codeChannel:
		oauthHandler.Shutdown()
		characterLimit := len(code)
		if characterLimit > 8 {
			characterLimit = 8
		}
		return &Credential{
			ProviderID:  provider,
			AccessToken: "mock_access_token_" + code[:characterLimit],
			IsLinked:    true,
			ExpiresAt:   time.Now().Add(30 * 24 * time.Hour).Format(time.RFC3339),
		}, nil

	case err := <-errorChannel:
		oauthHandler.Shutdown()
		return nil, err

	case <-time.After(3 * time.Minute):
		oauthHandler.Shutdown()
		return nil, fmt.Errorf("authentication timed out after 3 minutes")
	}
}

func (oauthHandler *OAuthHandler) Shutdown() {
	oauthHandler.mutex.Lock()
	defer oauthHandler.mutex.Unlock()
	if oauthHandler.httpServer != nil {
		shutdownContext, cancelFunc := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancelFunc()
		_ = oauthHandler.httpServer.Shutdown(shutdownContext)
		oauthHandler.httpServer = nil
	}
}

func getProviderAuthURL(provider ProviderID) string {
	switch provider {
	case ProviderChatGPT:
		return "https://auth0.openai.com/authorize?response_type=code&client_id=catalyst_app&redirect_uri=http://localhost:8080/callback"
	case ProviderClaude:
		return "https://auth.anthropic.com/oauth/authorize?response_type=code&client_id=catalyst_app&redirect_uri=http://localhost:8080/callback"
	default:
		return "http://localhost:8080/callback?code=mock_success"
	}
}

func openBrowser(targetURL string) error {
	var commandName string
	var commandArguments []string

	switch runtime.GOOS {
	case "windows":
		commandName = "cmd"
		commandArguments = []string{"/c", "start", targetURL}
	case "darwin":
		commandName = "open"
		commandArguments = []string{targetURL}
	default:
		commandName = "xdg-open"
		commandArguments = []string{targetURL}
	}

	return exec.Command(commandName, commandArguments...).Start()
}
