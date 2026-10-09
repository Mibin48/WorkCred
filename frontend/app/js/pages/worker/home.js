import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { Badge, Button, Card, Skeleton } from '../../components/index.js';

export function renderWorkerHome({ navigate, user }) {
  return workerShell({ title: en.worker.home, active: '/w/home', navigate, user, content: h('div', { className: 'wc-page-stack' },
    h('p', { className: 'wc-eyebrow' }, en.brand.tagline), h('h2', { className: 'wc-greeting' }, en.worker.hello.replace('{name}', user.name || en.profile.title)),
    Card({ className: 'wc-feature-card', children: h('div', { className: 'wc-feature-inner' }, Badge({ label: en.common.preview ?? 'Preview', kind: 'clay' }), h('h2', {}, en.worker.free), h('p', {}, en.worker.freeBody), h('div', { className: 'wc-code-illustration', 'aria-hidden': 'true' }, h('span', {}, '••••'), h('span', {}, '••••')), h('p', { className: 'wc-hint' }, en.worker.recordBody)) }),
    h('section', { className: 'wc-section-block' }, h('div', { className: 'wc-section-title' }, h('h2', {}, en.worker.record), h('span', { className: 'wc-label' }, en.common.today)), Skeleton({ rows: 2 })),
    Button({ label: en.worker.passport, variant: 'outline', onClick: () => navigate('/w/passport') })
  ) });
}
