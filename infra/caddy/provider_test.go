package duckdnsprivate

import (
	"context"
	upstream "github.com/caddy-dns/duckdns"
	"github.com/libdns/duckdns"
	"github.com/libdns/libdns"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestProviderRedactsUpstreamErrors(t *testing.T) {
	token := "00000000-0000-0000-0000-000000000000"
	original := http.DefaultClient
	defer func() { http.DefaultClient = original }()
	http.DefaultClient = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Query().Get("token") != token {
			t.Fatal("token missing from provider request")
		}
		// Real upstream error includes the URL and response body; both contain token here.
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("KO\n" + token)), Header: make(http.Header)}, nil
	})}
	provider := &Provider{upstream.Provider{Provider: &duckdns.Provider{APIToken: token}}}
	records := []libdns.Record{libdns.TXT{Name: "_acme-challenge", Text: "test-proof"}}
	for _, operation := range []func(context.Context, string, []libdns.Record) ([]libdns.Record, error){provider.AppendRecords, provider.DeleteRecords, provider.SetRecords} {
		_, err := operation(context.Background(), "test-app.duckdns.org.", records)
		if err == nil || strings.Contains(err.Error(), token) || strings.Contains(err.Error(), "https://") {
			t.Fatal("unsafe provider error")
		}
	}
}
