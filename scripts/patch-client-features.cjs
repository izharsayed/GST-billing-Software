/**
 * Patch script: Add Contact Person + Project Sites features to client management.
 * Modifies: ClientModal.jsx, ClientsView.jsx, InvoiceGenerator.jsx
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'components');

// ---------- Helper ----------
function patchFile(filePath, patches) {
  let content = fs.readFileSync(filePath, 'utf-8');
  // Normalize to LF for matching, we'll restore CRLF at end
  const hadCRLF = content.includes('\r\n');
  if (hadCRLF) content = content.replace(/\r\n/g, '\n');
  for (const [label, target, replacement] of patches) {
    if (!content.includes(target)) {
      console.error(`[FAIL] ${path.basename(filePath)} — target not found for: ${label}`);
      console.error(`  Looking for: ${JSON.stringify(target.substring(0, 80))}...`);
      process.exit(1);
    }
    content = content.replace(target, replacement);
    console.log(`  [OK] ${label}`);
  }
  if (hadCRLF) content = content.replace(/\n/g, '\r\n');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`  ✅ Saved ${path.basename(filePath)}\n`);
}

// ============================================================
// 1. ClientModal.jsx
// ============================================================
console.log('=== Patching ClientModal.jsx ===');
patchFile(path.join(SRC, 'ClientModal.jsx'), [

  // 1a. Import icons for sites section
  [
    'Add Lucide icons for sites',
    "import { X } from 'lucide-react';",
    "import { X, Plus, Trash2, MapPin, ChevronDown, ChevronUp } from 'lucide-react';"
  ],

  // 1b. Add contactPerson and sites to emptyForm
  [
    'Add contactPerson + sites to emptyForm',
    "    name: '', address: '', city: '', pin: '', state: '', gstin: '', email: '', phone: '',",
    "    name: '', contactPerson: '', address: '', city: '', pin: '', state: '', gstin: '', email: '', phone: '',"
  ],

  // 1c. Add sites to emptyForm (after autoPrint)
  [
    'Add sites array to emptyForm',
    "    autoPrint: false,          // per-client auto-print override\n  };",
    "    autoPrint: false,          // per-client auto-print override\n    sites: [],                   // project sites / delivery addresses\n  };"
  ],

  // 1d. Add contactPerson + sites to useEffect form population
  [
    'Populate contactPerson + sites from client prop',
    "        name: client.name || '', address: client.address || '', city: client.city || '',",
    "        name: client.name || '', contactPerson: client.contactPerson || '', address: client.address || '', city: client.city || '',"
  ],

  // 1e. Add sites to useEffect population (after autoPrint)
  [
    'Populate sites from client prop',
    "        autoPrint: !!client.autoPrint,\n      });",
    "        autoPrint: !!client.autoPrint,\n        sites: Array.isArray(client.sites) ? client.sites : [],\n      });"
  ],

  // 1f. Widen modal
  [
    'Widen modal to 680px for sites section',
    "style={{ maxWidth: '520px' }}",
    "style={{ maxWidth: '680px' }}"
  ],

  // 1g. Add Contact Person field after Business Name
  [
    'Add Contact Person field after Business Name',
    `          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Address</label>`,
    `          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Contact Person</label>
            <input type="text" className="form-input" value={form.contactPerson} onChange={e => setForm(prev => ({ ...prev, contactPerson: e.target.value }))} placeholder="e.g. Mr. Rajesh Sharma \u2014 Purchase Manager" />
          </div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Address</label>`
  ],

  // 1h. Add Sites/Projects section before Print Preferences
  [
    'Add Project Sites Manager section',
    `          {/* v1.9.1 — per-client print preferences. All optional; leave blank
              to use the app-wide defaults from Settings. When set, they
              auto-apply the next time an invoice is created for this client. */}`,
    `          {/* Project Sites / Delivery Addresses */}
          <div className="form-group" style={{ gridColumn: 'span 2', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />
                Project Sites / Delivery Addresses
              </div>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                onClick={() => setForm(prev => ({ ...prev, sites: [...prev.sites, { id: Date.now().toString(), siteName: '', address: '', city: '', state: '', pin: '', contactPerson: '', phone: '' }] }))}>
                <Plus size={12} /> Add Site
              </button>
            </div>
            {form.sites.length === 0 && (
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.25rem 0', fontStyle: 'italic' }}>
                No project sites yet. Add sites to quickly fill Ship-To address on invoices.
              </p>
            )}
            {form.sites.map((site, idx) => (
              <div key={site.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem', marginBottom: '0.5rem', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Site #{idx + 1}</span>
                  <button type="button" className="icon-btn icon-btn-red" style={{ padding: 2 }}
                    onClick={() => setForm(prev => ({ ...prev, sites: prev.sites.filter(s => s.id !== site.id) }))}
                    title="Remove this site"><Trash2 size={14} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <input type="text" className="form-input" style={{ fontSize: '0.8rem' }} placeholder="Site / Project Name *" value={site.siteName}
                      onChange={e => { const v = e.target.value; setForm(prev => ({ ...prev, sites: prev.sites.map(s => s.id === site.id ? { ...s, siteName: v } : s) })); }} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <input type="text" className="form-input" style={{ fontSize: '0.8rem' }} placeholder="Address" value={site.address}
                      onChange={e => { const v = e.target.value; setForm(prev => ({ ...prev, sites: prev.sites.map(s => s.id === site.id ? { ...s, address: v } : s) })); }} />
                  </div>
                  <input type="text" className="form-input" style={{ fontSize: '0.8rem' }} placeholder="City" value={site.city}
                    onChange={e => { const v = e.target.value; setForm(prev => ({ ...prev, sites: prev.sites.map(s => s.id === site.id ? { ...s, city: v } : s) })); }} />
                  <input type="text" className="form-input" style={{ fontSize: '0.8rem' }} placeholder="State" value={site.state}
                    onChange={e => { const v = e.target.value; setForm(prev => ({ ...prev, sites: prev.sites.map(s => s.id === site.id ? { ...s, state: v } : s) })); }} />
                  <input type="text" className="form-input" style={{ fontSize: '0.8rem' }} placeholder="PIN Code" value={site.pin} maxLength={6}
                    onChange={e => { const v = e.target.value; setForm(prev => ({ ...prev, sites: prev.sites.map(s => s.id === site.id ? { ...s, pin: v } : s) })); }} />
                  <input type="text" className="form-input" style={{ fontSize: '0.8rem' }} placeholder="Site Contact Person" value={site.contactPerson}
                    onChange={e => { const v = e.target.value; setForm(prev => ({ ...prev, sites: prev.sites.map(s => s.id === site.id ? { ...s, contactPerson: v } : s) })); }} />
                  <input type="tel" className="form-input" style={{ fontSize: '0.8rem' }} placeholder="Site Phone" value={site.phone}
                    onChange={e => { const v = e.target.value; setForm(prev => ({ ...prev, sites: prev.sites.map(s => s.id === site.id ? { ...s, phone: v } : s) })); }} />
                </div>
              </div>
            ))}
          </div>

          {/* v1.9.1 — per-client print preferences. All optional; leave blank
              to use the app-wide defaults from Settings. When set, they
              auto-apply the next time an invoice is created for this client. */}`
  ],
]);

// ============================================================
// 2. ClientsView.jsx
// ============================================================
console.log('=== Patching ClientsView.jsx ===');
patchFile(path.join(SRC, 'ClientsView.jsx'), [

  // 2a. Add contactPerson to Statement PDF clientLines
  [
    'Add contactPerson to Statement PDF',
    `      const clientLines = [
        savedClient.address,
        [savedClient.city, savedClient.state, savedClient.pin].filter(Boolean).join(', '),
        savedClient.gstin ? \`GSTIN: \${savedClient.gstin}\` : null,
        savedClient.email,
        savedClient.phone ? \`Ph: \${savedClient.phone}\` : null,
      ].filter(Boolean);`,
    `      const clientLines = [
        savedClient.contactPerson || null,
        savedClient.address,
        [savedClient.city, savedClient.state, savedClient.pin].filter(Boolean).join(', '),
        savedClient.gstin ? \`GSTIN: \${savedClient.gstin}\` : null,
        savedClient.email,
        savedClient.phone ? \`Ph: \${savedClient.phone}\` : null,
      ].filter(Boolean);`
  ],

  // 2b. Add contactPerson to client card meta line
  [
    'Add contactPerson to card meta',
    `                      <p className="client-card-meta">
                        {stats.count} invoice{stats.count !== 1 ? 's' : ''}
                        {savedClient?.state ? \` | \${savedClient.state}\` : ''}
                        {savedClient?.gstin ? \` | \${savedClient.gstin}\` : ''}
                      </p>`,
    `                      <p className="client-card-meta">
                        {stats.count} invoice{stats.count !== 1 ? 's' : ''}
                        {savedClient?.contactPerson ? \` | \${savedClient.contactPerson}\` : ''}
                        {savedClient?.state ? \` | \${savedClient.state}\` : ''}
                        {savedClient?.gstin ? \` | \${savedClient.gstin}\` : ''}
                      </p>`
  ],

  // 2c. Add contactPerson + sites to expanded client details
  [
    'Add contactPerson + sites to expanded details',
    `                    {savedClient && (savedClient.address || savedClient.city || savedClient.email || savedClient.phone) && (
                      <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {(savedClient.address || savedClient.city || savedClient.pin) && (
                          <span>{[savedClient.address, savedClient.city, savedClient.pin].filter(Boolean).join(', ')}</span>
                        )}
                        {savedClient.email && <span>{savedClient.email}</span>}
                        {savedClient.phone && <span>{savedClient.phone}</span>}
                      </div>
                    )}`,
    `                    {savedClient && (savedClient.address || savedClient.city || savedClient.email || savedClient.phone || savedClient.contactPerson) && (
                      <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {savedClient.contactPerson && <span style={{ fontWeight: 600 }}>{savedClient.contactPerson}</span>}
                        {(savedClient.address || savedClient.city || savedClient.pin) && (
                          <span>{[savedClient.address, savedClient.city, savedClient.pin].filter(Boolean).join(', ')}</span>
                        )}
                        {savedClient.email && <span>{savedClient.email}</span>}
                        {savedClient.phone && <span>{savedClient.phone}</span>}
                      </div>
                    )}
                    {/* Project Sites list */}
                    {savedClient?.sites?.length > 0 && (
                      <div style={{ padding: '0.5rem 1.5rem', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.68rem' }}>📍 Project Sites:</span>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                          {savedClient.sites.map(site => (
                            <span key={site.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.2rem 0.5rem' }}>
                              <strong>{site.siteName}</strong>{site.city ? \` — \${site.city}\` : ''}{site.state ? \`, \${site.state}\` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}`
  ],
]);

// ============================================================
// 3. InvoiceGenerator.jsx — Site picker in Ship To
// ============================================================
console.log('=== Patching InvoiceGenerator.jsx ===');
patchFile(path.join(SRC, 'InvoiceGenerator.jsx'), [

  // 3a. Add site picker dropdown before the Ship To address fields
  [
    'Add site picker dropdown in Ship To section',
    `                {details.shipToSameAsBilling === false && (
                  <div className="grid grid-cols-2 gap-3" style={{ marginTop: '0.6rem' }}>
                    <div className="form-group full-width">
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>Shipping Address</label>`,
    `                {details.shipToSameAsBilling === false && (
                  <div className="grid grid-cols-2 gap-3" style={{ marginTop: '0.6rem' }}>
                    {/* Site picker — auto-fill from saved project sites */}
                    {(() => {
                      const cli = selectedClientId ? savedClients.find(c => c.id === selectedClientId) : null;
                      const sites = cli?.sites?.length ? cli.sites : null;
                      if (!sites) return null;
                      return (
                        <div className="form-group full-width">
                          <label className="form-label" style={{ fontSize: '0.78rem' }}>📍 Select Project Site</label>
                          <select className="form-input" style={{ fontSize: '0.82rem', fontWeight: 500 }}
                            value=""
                            onChange={e => {
                              const site = sites.find(s => s.id === e.target.value);
                              if (site) {
                                setDetails(prev => ({
                                  ...prev,
                                  shippingAddress: site.address || '',
                                  shippingCity: site.city || '',
                                  shippingPin: site.pin || '',
                                  shippingState: site.state || '',
                                }));
                              }
                            }}>
                            <option value="">— Choose a saved site to auto-fill —</option>
                            {sites.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.siteName}{s.city ? \` — \${s.city}\` : ''}{s.state ? \`, \${s.state}\` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })()}
                    <div className="form-group full-width">
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>Shipping Address</label>`
  ],
]);

console.log('\n✅ All patches applied successfully!');
