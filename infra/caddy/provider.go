// Package duckdnsprivate suppresses upstream errors that can contain the API token.
package duckdnsprivate

import (
	"context"
	"errors"
	upstream "github.com/caddy-dns/duckdns"
	"github.com/caddyserver/caddy/v2"
	"github.com/libdns/duckdns"
	"github.com/libdns/libdns"
)

type Provider struct{ upstream.Provider }

func init() { caddy.RegisterModule(Provider{}) }
func (Provider) CaddyModule() caddy.ModuleInfo {
	return caddy.ModuleInfo{ID: "dns.providers.duckdns_private", New: func() caddy.Module {
		return &Provider{upstream.Provider{Provider: &duckdns.Provider{}}}
	}}
}
func safe(records []libdns.Record, err error) ([]libdns.Record, error) {
	if err != nil {
		return nil, errors.New("DuckDNS operation failed; check token, DNS and connectivity (credentials omitted)")
	}
	return records, nil
}
func (p *Provider) AppendRecords(ctx context.Context, zone string, records []libdns.Record) ([]libdns.Record, error) {
	return safe(p.Provider.AppendRecords(ctx, zone, records))
}
func (p *Provider) DeleteRecords(ctx context.Context, zone string, records []libdns.Record) ([]libdns.Record, error) {
	return safe(p.Provider.DeleteRecords(ctx, zone, records))
}
func (p *Provider) SetRecords(ctx context.Context, zone string, records []libdns.Record) ([]libdns.Record, error) {
	return safe(p.Provider.SetRecords(ctx, zone, records))
}
func (p *Provider) GetRecords(ctx context.Context, zone string) ([]libdns.Record, error) {
	return safe(p.Provider.GetRecords(ctx, zone))
}
