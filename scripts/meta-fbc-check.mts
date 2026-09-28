import assert from 'assert';
import {
  sanitizeAndValidateFbc,
  sanitizeAndValidateFbp,
  isValidFbclid,
  isUsableClientIp,
  extractClientIp,
  applyClientContext,
  readFbcFromCookieHeader,
  readFbpFromCookieHeader,
} from '../api/_metaFbc';

const now = Date.now();
const goodFbclid = 'IwAR2abcdefghijklmnopqrstuvwxyz012345';
const goodFbc = `fb.1.${now}.${goodFbclid}`;

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failures++;
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

console.log('\n[fbc] Meta never sees a rebuilt or mangled click id');

check('valid fbc passes through byte-for-byte', () => {
  assert.strictEqual(sanitizeAndValidateFbc(goodFbc), goodFbc);
});

check('case is preserved (never lowercased)', () => {
  const mixed = `fb.1.${now}.${goodFbclid}`;
  const out = sanitizeAndValidateFbc(mixed)!;
  assert.strictEqual(out, mixed);
  assert.ok(out.includes(goodFbclid), 'fbclid casing must survive');
});

check('percent-encoded cookie transport round-trips', () => {
  const out = sanitizeAndValidateFbc(encodeURIComponent(goodFbc));
  assert.strictEqual(out, goodFbc);
});

check('truncated fbclid is dropped, not repaired', () => {
  assert.strictEqual(sanitizeAndValidateFbc(`fb.1.${now}.IwAR2abc`), undefined);
});

check('exact placeholder click ids are dropped', () => {
  // Exact-match only, deliberately: substring matching on a placeholder list
  // could reject a genuine click id and cost attribution.
  assert.strictEqual(sanitizeAndValidateFbc(`fb.1.${now}.iwar0123456789abcdef`), undefined);
  assert.strictEqual(sanitizeAndValidateFbc(`fb.1.${now}.fbclid`), undefined);
  assert.strictEqual(isValidFbclid('test'), false);
  assert.strictEqual(isValidFbclid('dummy'), false);
});

check('future-dated click time is dropped', () => {
  assert.strictEqual(sanitizeAndValidateFbc(`fb.1.${now + 86_400_000}.${goodFbclid}`), undefined);
});

check('click older than 90 days is dropped', () => {
  const old = now - 91 * 24 * 60 * 60 * 1000;
  assert.strictEqual(sanitizeAndValidateFbc(`fb.1.${old}.${goodFbclid}`), undefined);
});

check('garbage input yields undefined (omit, never guess)', () => {
  assert.strictEqual(sanitizeAndValidateFbc(''), undefined);
  assert.strictEqual(sanitizeAndValidateFbc(null), undefined);
  assert.strictEqual(sanitizeAndValidateFbc('fb.1.notanumber.' + goodFbclid), undefined);
  assert.strictEqual(sanitizeAndValidateFbc(goodFbclid), undefined, 'bare fbclid is NOT an fbc');
});

check('no synthesis: the module cannot build fbc from a raw fbclid', () => {
  // The old signature was (rawFbc, rawFbclid) and returned fb.1.<now>.<fbclid>.
  assert.strictEqual((sanitizeAndValidateFbc as any).length, 1, 'must take exactly one argument');
});

check('cookie header readers validate too', () => {
  assert.strictEqual(readFbcFromCookieHeader(`_fbp=fb.1.${now}.123; _fbc=${encodeURIComponent(goodFbc)}; x=1`), goodFbc);
  assert.strictEqual(readFbpFromCookieHeader(`_fbp=fb.1.${now}.123456`), `fb.1.${now}.123456`);
  assert.strictEqual(readFbcFromCookieHeader('_fbc=broken'), undefined);
  assert.strictEqual(readFbpFromCookieHeader('_fbp=notmeta'), undefined);
});

check('isValidFbclid accepts realistic click ids only', () => {
  assert.strictEqual(isValidFbclid(goodFbclid), true);
  assert.strictEqual(isValidFbclid('short'), false);
  assert.strictEqual(isValidFbclid('has spaces in the value 123456789'), false);
});

console.log('\n[fbp] never invented server-side');

check('Meta-format fbp accepted', () => {
  assert.strictEqual(sanitizeAndValidateFbp(`fb.1.${now}.987654321`), `fb.1.${now}.987654321`);
});

check('non-Meta fbp rejected', () => {
  assert.strictEqual(sanitizeAndValidateFbp('abc123'), undefined);
  assert.strictEqual(sanitizeAndValidateFbp(''), undefined);
});

console.log('\n[client IP] shared/CGNAT addresses are never sent');

check('loopback and RFC1918 rejected', () => {
  ['127.0.0.1', '10.1.2.3', '192.168.1.20', '172.16.0.9', '169.254.10.1', '100.64.0.1', '0.0.0.0']
    .forEach((ip) => assert.strictEqual(isUsableClientIp(ip), false, `${ip} must be rejected`));
});

check('ipv6 loopback / unique-local / link-local rejected', () => {
  ['::1', '::', 'fd00::1', 'fe80::1', 'unknown'].forEach((ip) =>
    assert.strictEqual(isUsableClientIp(ip), false, `${ip} must be rejected`)
  );
});

check('public IPv4 and IPv6 accepted', () => {
  assert.strictEqual(isUsableClientIp('41.111.2.33'), true);
  assert.strictEqual(isUsableClientIp('2001:db8::1'), true);
  assert.strictEqual(isUsableClientIp('::ffff:41.111.2.33'), true);
});

check('CF-Connecting-IP wins over X-Forwarded-For', () => {
  assert.strictEqual(
    extractClientIp({ 'cf-connecting-ip': '41.111.2.33', 'x-forwarded-for': '86.96.130.10' }),
    '41.111.2.33'
  );
});

check('True-Client-IP beats X-Forwarded-For, X-Real-IP is last resort', () => {
  assert.strictEqual(
    extractClientIp({ 'true-client-ip': '41.111.2.33', 'x-forwarded-for': '86.96.130.10' }),
    '41.111.2.33'
  );
  assert.strictEqual(extractClientIp({ 'x-real-ip': '41.111.2.33' }), '41.111.2.33');
});

check('header names are case-insensitive, private hops are skipped', () => {
  assert.strictEqual(
    extractClientIp({ 'CF-Connecting-IP': '41.111.2.33' }),
    '41.111.2.33'
  );
  // Private CF value falls through to the next usable public hop.
  assert.strictEqual(
    extractClientIp({ 'cf-connecting-ip': '10.0.0.9', 'x-forwarded-for': '41.111.2.33, 10.0.0.1' }),
    '41.111.2.33'
  );
  assert.strictEqual(extractClientIp({ 'CF-Connecting-IP': '192.168.1.5' }), undefined);
});

check('RFC7239 Forwarded header and ::ffff: prefix handled', () => {
  assert.strictEqual(
    extractClientIp({ forwarded: 'for=41.111.2.33;proto=https' }),
    '41.111.2.33'
  );
  assert.strictEqual(extractClientIp({ 'x-forwarded-for': '::ffff:41.111.2.33' }), '41.111.2.33');
});

check('no socket/host fallback: unusable headers yield undefined', () => {
  assert.strictEqual(extractClientIp({ 'x-forwarded-for': '10.0.0.1, 192.168.0.5' }), undefined);
  assert.strictEqual(extractClientIp({ 'x-forwarded-for': 'unknown' }), undefined);
});

check('IP and user agent are sent only as a pair', () => {
  const withBoth: Record<string, unknown> = {};
  applyClientContext(withBoth, { ip: '41.111.2.33', userAgent: 'Mozilla/5.0' });
  assert.strictEqual(withBoth.client_ip_address, '41.111.2.33');
  assert.strictEqual(withBoth.client_user_agent, 'Mozilla/5.0');

  const noUa: Record<string, unknown> = {};
  applyClientContext(noUa, { ip: '41.111.2.33', userAgent: '' });
  assert.deepStrictEqual(noUa, {}, 'IP without UA must be dropped entirely');

  const privateIp: Record<string, unknown> = {};
  applyClientContext(privateIp, { ip: '192.168.0.5', userAgent: 'Mozilla/5.0' });
  assert.deepStrictEqual(privateIp, {}, 'private IP must be dropped');
});

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
